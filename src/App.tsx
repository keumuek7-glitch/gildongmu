import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HomeScreen, type Favorite, type HomeDestination } from './screens/HomeScreen';
import { RouteChoiceScreen } from './screens/RouteChoiceScreen';
import { PlaceConfirmScreen } from './screens/PlaceConfirmScreen';
import { ActiveGuideScreen } from './screens/ActiveGuideScreen';
import { MissedStopRecoveryBanner } from './components/MissedStopRecoveryBanner';
import { SosButton } from './components/SosButton';
import { BusAwayScreen } from './components/BusAwayScreen';
import { useBackClose } from './hooks/useBackClose';
import { DevTestPanel, type DevActions } from './components/DevTestPanel';
import { classifyRoutes, type ClassifiedRoutes, type ScoredRoute } from './core/classifier/seniorRouteClassifier';
import { buildRouteLegs, isRideLeg } from './core/stateMachine/routeLegBuilder';
import {
  createMultiLegState,
  currentLeg,
  multiLegReducer,
  type ManagerEffect,
  type MultiLegEvent,
  type MultiLegState,
} from './core/stateMachine/multiLegManager';
import { reconcileSession, type ReconcileResult, type ReconcileWarning } from './core/stateMachine/sessionTimeReconciler';
import { decodeGuardianLink } from './core/guardian/guardianLinkCodec';
import { RouteApiError } from './services/routeApiClient';
import { routeService } from './services/routeServiceInstance';
import { createWebSpeechAdapter, vibrate } from './services/speechAdapter';
import { getCurrentLocation, FALLBACK_LOCATION } from './utils/currentLocationHelper';
import { loadPersistedSession, usePersistedMultiLegSession } from './hooks/usePersistedMultiLegSession';
import {
  buildGuideLink,
  buildPairLink,
  parseGuideLink,
  parsePairLink,
  parseRole,
  sanitizeTrip,
  tripDestToRouteDest,
  type RelayMessage,
  type Role,
} from './core/guardian/familyRelay';
import { FamilyRelayClient, gdStore, type RelayState } from './services/familyRelayClient';
import { RoleSelectScreen } from './screens/RoleSelectScreen';
import { FamilyScreen, type ElderLoc } from './screens/FamilyScreen';
import type { TripData } from './core/guardian/familyRelay';
import { SettingsScreen } from './screens/SettingsScreen';
import { CompassView, type CompassTarget } from './components/CompassView';
import { RoadviewGuide, sanitizeGuide, type FamilyGuide } from './components/RoadviewGuide';
import { sendKakao, shareResultText } from './services/kakaoInApp';
import { getKakaoKey, loadKakao, searchPlaces, type PlaceResult } from './services/kakaoMaps';
import { isSameAsPrefilled, limitCandidates, normalizePlaceText } from './core/places/placeInput';
import { useBusProximityAlert } from './hooks/useBusProximityAlert';
import { BusAlightBanner } from './components/BusAlightBanner';
import { sanitizeNearM, type AlightAlert } from './core/navigation/proximityAlight';
import { josa } from './core/safety/directionCheck';

type Screen = 'HOME' | 'PLACE' | 'CHOICE' | 'GUIDE';
interface Dest { name: string; x: number; y: number }

/** 시연용 즐겨찾기. 좌표는 대략값입니다(정확한 좌표 확인 필요). */
const FAVORITES: Favorite[] = [
  { id: 'snuh', label: '🏥 서울대병원', name: '서울대학교병원', x: 126.999, y: 37.5797 },
];

const PHONE_KEY = 'sth.guardianPhone';
const readPhone = () => {
  try { return localStorage.getItem(PHONE_KEY) ?? ''; } catch { return ''; }
};

/** 처음 한 번: 연결 링크(?pair=)·?role= 을 읽어 저장하고 주소에서 지웁니다. */
function readInitialRole(): { role: Role | null; pairedNow: boolean; guideLink: boolean } {
  const search = window.location.search;
  const pair = parsePairLink(search);
  const urlRole = parseRole(new URLSearchParams(search).get('role'));
  let role = urlRole ?? parseRole(gdStore.get<string | null>('role', null));
  if (role) gdStore.set('role', role);
  if (pair) {
    gdStore.set('room', pair.room);
    try {
      const rest = new URLSearchParams(search);
      rest.delete('pair');
      const q = rest.toString();
      history.replaceState(history.state, '', window.location.pathname + (q ? '?' + q : ''));
    } catch { /* noop */ }
  }
  // 카톡으로 받은 길 안내 링크(?go=, 기존 길동무와 같음): 받은 것으로 저장하고 주소에서 지움
  const go = parseGuideLink(search);
  if (go) {
    const t = Date.now();
    gdStore.set('last_guide', { type: 'guide', data: { ...go.guide, t }, t, from: 'child' });
    if (go.trip) gdStore.set('last_trip', { type: 'trip', data: go.trip, t, from: 'child' });
    role = 'elder';
    gdStore.set('role', role);
    try { history.replaceState(history.state, '', window.location.pathname + '?role=elder'); } catch { /* noop */ }
  }
  return { role, pairedNow: !!pair, guideLink: !!go };
}

function relayTripDest(m: RelayMessage | null) {
  return m ? tripDestToRouteDest(sanitizeTrip(m.data)) : null;
}

export default function App() {
  const initial = useMemo(readInitialRole, []);
  const [role, setRole] = useState<Role | null>(initial.role);
  const relay = useMemo(() => new FamilyRelayClient(initial.role), [initial]);
  const [relayState, setRelayState] = useState<RelayState>('off');
  const [paired, setPaired] = useState(() => relay.isPaired());
  const [relayDest, setRelayDest] = useState(() => relayTripDest(relay.last('trip')));
  const [notice, setNotice] = useState<string | null>(initial.pairedNow ? '가족과 연결됐어요' : null);
  const [familyTrip, setFamilyTrip] = useState<TripData | null>(() => sanitizeTrip(relay.last('trip')?.data));
  const [compassTarget, setCompassTarget] = useState<CompassTarget | null>(null);
  const [familyGuide, setFamilyGuide] = useState<FamilyGuide | null>(() => sanitizeGuide(relay.last('guide')?.data));
  const [guideOpen, setGuideOpen] = useState(initial.guideLink);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testMode, setTestMode] = useState(() => gdStore.get<boolean>('testMode', false));
  const [elderLoc, setElderLoc] = useState<ElderLoc | null>(() => (relay.last<ElderLoc>('elderLoc')?.data ?? null));
  const [screen, setScreen] = useState<Screen>('HOME');
  const [session, setSession] = useState<MultiLegState | null>(null);
  const sessionRef = useRef<MultiLegState | null>(null);
  const [routes, setRoutes] = useState<ClassifiedRoutes | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 목적지 글자 입력 → 찾은 장소 후보 (한 번에 하나씩 보여 줌)
  const [placeList, setPlaceList] = useState<PlaceResult[] | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [originLabel, setOriginLabel] = useState('현재 위치 (길 찾기 때 확인)');
  const [warning, setWarning] = useState<ReconcileWarning>({ kind: 'NONE' });
  const [pendingRestore, setPendingRestore] = useState<ReconcileResult | null>(null);
  const [guardianPhone, setGuardianPhone] = useState(readPhone);
  const [phoneHint, setPhoneHint] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [simOffset, setSimOffset] = useState(0);
  const simOffsetRef = useRef(0);

  const guardianDest = useMemo(() => decodeGuardianLink(window.location.search), []);

  // ── 두 휴대폰 연결 (Firebase 중계) ─────────────────────
  useEffect(() => {
    relay.setRole(role);
    const offState = relay.onState(setRelayState);
    const offMsg = relay.onMessage((m) => {
      if (role === 'elder') {
        if (m.type === 'trip') setRelayDest(relayTripDest(m));
        else if (m.type === 'tripReset') setRelayDest(null);
        else if (m.type === 'viewed') setNotice('가족이 내 위치를 봤어요');
        else if (m.type === 'guide') {
          const g = sanitizeGuide(m.data);
          if (g) {
            setFamilyGuide(g);
            setGuideOpen(true);
            vibrate([300]);
          }
        }
      } else if (role === 'child') {
        if (m.type === 'elderLoc') {
          setElderLoc(m.data as ElderLoc);
          if ((m.data as { shout?: boolean })?.shout) setNotice('어르신이 지금 위치를 보냈어요');
        } else if (m.type === 'arrived') setNotice('어르신이 도착했어요');
        else if (m.type === 'alighted') setNotice('어르신이 내렸어요');
      }
    });
    if (role) relay.start();
    if (role === 'child') relay.send('viewed', {});
    return () => {
      offState();
      offMsg();
      relay.stop();
    };
  }, [relay, role]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const pickRole = useCallback((r: Role | null) => {
    if (r) gdStore.set('role', r);
    else gdStore.del('role');
    setRole(r);
  }, []);

  /** 내 위치를 가족 앱으로 보냅니다 (설정 화면의 버튼). 연결돼 있을 때만 갑니다. */
  const shareLocation = useCallback(async () => {
    setLocNote(null);
    const loc = await getCurrentLocation(8000);
    const gps = loc.source === 'GPS';
    if (gps) relay.send('elderLoc', { lat: loc.y, lng: loc.x, t: Date.now(), shout: true });
    setLocNote(!gps ? '위치를 못 찾았어요. 가족에게 도와 달라고 해 주세요' : relay.isPaired() ? '가족에게 위치를 보냈어요' : '가족 휴대폰과 아직 연결 안 됐어요');
  }, [relay]);
  const speech = useMemo(() => createWebSpeechAdapter(), []);
  const now = useCallback(() => Date.now() + simOffsetRef.current, []);
  const speakText = useCallback((t: string) => speech.speak(t), [speech]);

  const clearPersisted = usePersistedMultiLegSession(session, now);

  // ── 효과(발화·진동) 실행 ─────────────────────────────
  const runEffects = useCallback(
    (effects: ManagerEffect[]) => {
      for (const e of effects) {
        if (e.kind === 'SPEAK') speech.speak(e.vm.speech);
        else vibrate(e.pattern);
      }
    },
    [speech],
  );

  const apply = useCallback(
    (r: { state: MultiLegState | null; effects: ManagerEffect[] }) => {
      sessionRef.current = r.state;
      setSession(r.state);
      runEffects(r.effects);
    },
    [runEffects],
  );

  const dispatch = useCallback(
    (ev: MultiLegEvent) => {
      const cur = sessionRef.current;
      if (!cur) return;
      apply(multiLegReducer(cur, ev));
    },
    [apply],
  );

  // 카드 자동 발화와 디스패처가 같은 spokenKeys를 공유 (세션과 함께 저장됨)
  const binding = useMemo(
    () => ({
      speak: (text: string) => speech.speak(text),
      spoken: {
        has: (k: string) => sessionRef.current?.spokenKeys.has(k) ?? false,
        add: (k: string) => {
          sessionRef.current?.spokenKeys.add(k);
        },
      },
    }),
    [speech],
  );

  // ── 앱 시작: 진행 중 세션 복원 확인 ─────────────────────
  useEffect(() => {
    const restored = loadPersistedSession(Date.now());
    if (restored?.state) setPendingRestore(restored);
  }, []);

  // ── 1초 TICK ─────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'GUIDE') return;
    const id = setInterval(() => dispatch({ type: 'TICK', now: now() }), 1000);
    return () => clearInterval(id);
  }, [screen, dispatch, now]);

  // ── 길 찾기 ──────────────────────────────────────────
  const searchRoutes = useCallback(
    async (target: Dest) => {
      setLoading(true);
      setError(null);
      setDest(target);
      try {
        const loc = await getCurrentLocation();
        setOriginLabel(loc.source === 'GPS' ? '현재 위치' : `${FALLBACK_LOCATION.name} · ${loc.reason}`);
        const { routes: candidates } = await routeService.getRoutes({ sx: loc.x, sy: loc.y, ex: target.x, ey: target.y });
        const classified = classifyRoutes(candidates);
        if (!classified) throw new RouteApiError('NO_ROUTE', '갈 수 있는 길을 찾지 못했어요.');
        setRoutes(classified);
        setScreen('CHOICE');
      } catch (e) {
        setError(e instanceof RouteApiError ? e.message : '길 찾기 중 문제가 생겼어요.');
        setScreen('HOME');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * 홈의 [찾기]. 입력칸에 미리 써 둔 곳을 고치지 않았으면 바로 길 찾기,
   * 고쳐 썼으면 장소를 찾아서 후보를 한 번에 하나씩 물어봅니다.
   */
  const submitDestination = useCallback(
    async (raw: string, prefilled: Dest) => {
      const text = normalizePlaceText(raw);
      setError(null);
      if (!text) {
        setError('가고 싶은 곳을 써 주세요.');
        return;
      }
      if (isSameAsPrefilled(text, prefilled.name)) {
        void searchRoutes(prefilled);
        return;
      }
      setPlaceBusy(true);
      try {
        try { await loadKakao(); } catch { /* 안 불러와지면 아래에서 null 로 알게 됨 */ }
        const list = await searchPlaces(text);
        if (list === null) {
          setError(
            getKakaoKey()
              ? '장소를 찾지 못했어요. 잠시 후 다시 눌러 주세요.'
              : '장소 찾기가 아직 켜져 있지 않아요. 설정에서 카카오 키를 넣어 주세요.',
          );
          return;
        }
        if (list.length === 0) {
          setError('찾는 곳이 없어요. 다르게 써 주세요.');
          return;
        }
        setPlaceList(limitCandidates(list));
        setScreen('PLACE');
      } finally {
        setPlaceBusy(false);
      }
    },
    [searchRoutes],
  );

  const pickRoute = useCallback(
    (r: ScoredRoute) => {
      const destName = dest?.name ?? '목적지';
      const legs = buildRouteLegs(r.candidate, { destName, destCoord: dest ? { x: dest.x, y: dest.y } : undefined });
      setWarning({ kind: 'NONE' });
      simOffsetRef.current = 0;
      setSimOffset(0);
      apply(createMultiLegState({ routeId: r.candidate.id, destName, legs, now: now() }));
      setScreen('GUIDE');
    },
    [apply, dest, now],
  );

  const reroute = useCallback(() => {
    const target = dest ?? FAVORITES[0];
    setWarning({ kind: 'NONE' });
    void searchRoutes(target);
  }, [dest, searchRoutes]);

  const goHome = useCallback(() => {
    clearPersisted();
    apply({ state: null, effects: [] });
    setScreen('HOME');
  }, [apply, clearPersisted]);

  // ── 개발자 테스트 패널 동작 ─────────────────────────────
  const advanceClock = useCallback((ms: number) => {
    simOffsetRef.current += ms;
    setSimOffset(simOffsetRef.current);
  }, []);

  const ensureBoarded = useCallback(() => {
    const s = sessionRef.current;
    if (s?.transit?.phase === 'WAITING_BOARDING') dispatch({ type: 'BOARDED', now: now() });
  }, [dispatch, now]);

  // ── 버스 좌표 하차 알림 (기존 길동무: 400m 다음에 내려요, 60m 지금 내려요) ──
  const curLeg = session ? currentLeg(session) : undefined;
  const busLeg = curLeg && isRideLeg(curLeg) && curLeg.type === 'BUS_LEG' ? curLeg : undefined;
  const busRiding =
    screen === 'GUIDE' && !!busLeg && !session?.finished && !!session?.transit && session.transit.phase !== 'WAITING_BOARDING';
  const [busSimM, setBusSimM] = useState<number | null>(null);
  const [busAlert, setBusAlert] = useState<AlightAlert | null>(null);
  const [busAway, setBusAway] = useState(false);
  const alightNearM = useMemo(() => sanitizeNearM(gdStore.get('alightM', 400)), []);
  useEffect(() => {
    setBusSimM(null);
    setBusAlert(null);
    setBusAway(false);
  }, [busLeg?.id]);
  useBusProximityAlert({
    leg: busLeg,
    active: busRiding,
    nearM: alightNearM,
    simDistanceM: busSimM,
    onAlert: (alert, leg) => {
      const key = `busgps:${leg.id}:${alert.stage}`;
      const spoken = sessionRef.current?.spokenKeys;
      if (spoken?.has(key)) return;
      spoken?.add(key);
      setBusAlert(alert);
      vibrate(alert.vibrate);
      speech.speak(`${alert.text}. 내릴 곳은 ${leg.alightName}`);
    },
    onAway: (leg) => {
      setBusAlert(null);
      setBusAway(true);
      vibrate([500, 200, 500]);
      speech.speak(`${josa(leg.alightName, '을', '를')} 지나친 것 같아요. 다음 정류장에서 내려서 길을 다시 찾아요`);
    },
  });

  const devActions: DevActions = useMemo(
    () => ({
      board: () => ensureBoarded(),
      nextStation: () => {
        const s = sessionRef.current;
        const leg = s && currentLeg(s);
        if (!s || !leg) return;
        if (!isRideLeg(leg)) {
          dispatch({ type: 'WALK_DONE', now: now() });
          return;
        }
        ensureBoarded();
        const t = sessionRef.current!.transit!;
        const idx = Math.min(leg.stations.length - 1, Math.max(t.anchorIndex, t.estimatedIndex) + 1);
        dispatch({ type: 'STATION_OBSERVED', name: leg.stations[idx], now: now() });
      },
      wrongDirection: () => {
        const s = sessionRef.current;
        const leg = s && currentLeg(s);
        if (!leg || !isRideLeg(leg)) return;
        ensureBoarded();
        dispatch({ type: 'STATION_OBSERVED', name: leg.oppositeNeighbor ?? '반대 방향 역(가상)', now: now() });
      },
      slowDown: () => {
        const s = sessionRef.current;
        const leg = s && currentLeg(s);
        if (!leg || !isRideLeg(leg)) return;
        ensureBoarded();
        // 현재 역을 '관측'해 관측 모드로 만든 뒤, 다음 역 예상 시간의 1.4배를 흘려보냄
        const t = sessionRef.current!.transit!;
        dispatch({ type: 'STATION_OBSERVED', name: leg.stations[t.anchorIndex], now: now() });
        const hop = leg.hopSeconds[sessionRef.current!.transit!.anchorIndex] ?? 60;
        advanceClock(Math.ceil(hop * 1.4) * 1000);
        dispatch({ type: 'TICK', now: now() });
      },
      plusMinute: () => {
        advanceClock(60_000);
        dispatch({ type: 'TICK', now: now() });
      },
      simulateRestore: () => {
        const s = sessionRef.current;
        if (!s) return;
        const savedAt = now();
        advanceClock(10 * 60_000);
        const r = reconcileSession(s, savedAt, now());
        if (r.state) {
          apply({ state: r.state, effects: r.effects });
          setWarning(r.warning);
        }
      },
      busNear: () => setBusSimM(350),
      busNow: () => setBusSimM(40),
      busAway: () => {
        // 내릴 곳 가까이 갔다가(80m) 노선 여유보다 더 멀어짐
        const margin = busLeg?.awayMarginM ?? 300;
        setBusSimM(80);
        setTimeout(() => setBusSimM(80 + margin + 100), 300);
      },
      reset: () => {
        simOffsetRef.current = 0;
        setSimOffset(0);
        setWarning({ kind: 'NONE' });
        setPendingRestore(null);
        goHome();
      },
    }),
    [advanceClock, apply, dispatch, ensureBoarded, goHome, now],
  );

  // 도착하면 가족에게 알림
  const finished = !!session?.finished;
  const finishedDest = session?.destName;
  useEffect(() => {
    if (finished && role === 'elder') relay.send('arrived', { name: finishedDest });
  }, [finished, finishedDest, relay, role]);

  const devInfo = (() => {
    const s = session;
    const leg = s && currentLeg(s);
    const phase = s?.finished ? '도착' : leg && isRideLeg(leg) ? s?.transit?.phase : leg?.type ?? '-';
    return `시뮬레이션 시계 +${Math.round(simOffset / 1000)}초 · 상태: ${phase ?? '-'}`;
  })();

  // ── 폰의 뒤로 버튼 ──────────────────────────────────
  const closeRoadview = useCallback(() => setGuideOpen(false), []);
  useBackClose(settingsOpen, () => setSettingsOpen(false));
  useBackClose(!!compassTarget, () => setCompassTarget(null));
  useBackClose(guideOpen && !!familyGuide && !compassTarget, closeRoadview);
  useBackClose(screen === 'CHOICE', () => setScreen(session ? 'GUIDE' : 'HOME'));
  useBackClose(screen === 'PLACE', () => setScreen('HOME'));
  // 길 안내 중 뒤로(화면의 [뒤로]·폰의 뒤로 버튼): 그만할지 먼저 물어봄
  const quitGuide = useCallback((): boolean => {
    if (!window.confirm('길 안내를 그만할까요?')) return false;
    goHome();
    return true;
  }, [goHome]);
  useBackClose(role === 'elder' && screen === 'GUIDE' && !!session && !session.finished, () => (quitGuide() ? undefined : 'stay'));

  const makePairLink = () => {
    const room = relay.ensureRoom();
    setPaired(true);
    const t = relay.last('trip');
    if (t) relay.send('trip', t.data);
    return buildPairLink(window.location.href, room, 'elder');
  };

  if (!role) return <div className="app"><RoleSelectScreen onPick={pickRole} /></div>;

  const sos = role === 'elder' ? (
    <SosButton
      phone={guardianPhone}
      onNoPhone={() => {
        setPhoneHint(true);
        setSettingsOpen(true);
      }}
    />
  ) : null;

  if (settingsOpen) {
    return (
      <div className={role === 'elder' ? 'app app--elder' : 'app'}>
        {sos}
        <SettingsScreen
          role={role}
          paired={paired}
          relayState={relayState}
          onMakeLink={role === 'child' ? makePairLink : undefined}
          onUnpair={() => {
            relay.leave();
            setPaired(false);
          }}
          guardianPhone={guardianPhone}
          phoneHint={phoneHint}
          onSavePhone={(p) => {
            setGuardianPhone(p);
            try { localStorage.setItem(PHONE_KEY, p); } catch { /* noop */ }
          }}
          onShareLocation={role === 'elder' ? () => void shareLocation() : undefined}
          locationNote={locNote}
          hasFamilyGuide={!!familyGuide}
          onOpenFamilyGuide={() => {
            setSettingsOpen(false);
            setGuideOpen(true);
          }}
          testMode={testMode}
          onToggleTestMode={(on) => {
            setTestMode(on);
            gdStore.set('testMode', on);
          }}
          onChangeRole={() => {
            setSettingsOpen(false);
            pickRole(role === 'elder' ? 'child' : 'elder');
          }}
          onBack={() => {
            setSettingsOpen(false);
            setPhoneHint(false);
          }}
        />
      </div>
    );
  }

  if (role === 'child') {
    return (
      <div className="app">
        <FamilyScreen
          elderLoc={elderLoc}
          onOpenSettings={() => setSettingsOpen(true)}
          trip={familyTrip}
          news={notice}
          paired={paired}
          onSendTrip={(t) => {
            relay.send('trip', t);
            setFamilyTrip(t);
            setNotice(paired ? '어르신 휴대폰으로 도착지를 보냈어요' : '휴대폰 연결 전이라 아직 못 보냈어요. 아래에서 연결해 주세요');
          }}
          onResetTrip={() => {
            const empty: TripData = { from: null, stop: null, dest: null };
            relay.send('tripReset', {});
            relay.send('trip', empty);
            setFamilyTrip(empty);
          }}
          onSendGuide={async (g) => {
            if (familyTrip?.dest) relay.send('trip', familyTrip);
            relay.send('guide', g);
            if (paired) {
              setNotice('어르신 휴대폰으로 보냈어요');
              return;
            }
            // 연결 전: 카톡 링크로 (어르신이 링크를 열면 로드뷰·방향·도착지가 뜸)
            const url = buildGuideLink(window.location.href, {
              g: { lat: g.lat, lng: g.lng, pan: g.pan, phrase: g.phrase },
              trip: familyTrip?.dest ? { stop: familyTrip.stop, dest: familyTrip.dest } : null,
            });
            const r = await sendKakao(`어르신께 길 안내: ${g.phrase}\n「길 보기」나 링크를 누르면 로드뷰와 방향이 떠요`, url, '길 보기');
            setNotice(r === 'fail' ? `보내지 못했어요. 이 링크를 복사해 보내 주세요: ${url}` : shareResultText(r));
          }}
        />
      </div>
    );
  }

  // 어르신 화면: 한 번에 한 화면만 그리고, 어느 화면이든 버튼은 2개 이하입니다.
  const familyDest = relayDest ?? guardianDest;
  const fav = FAVORITES[0];
  const homeDestination: HomeDestination = familyDest
    ? { label: `🚩 ${familyDest.name}`, name: familyDest.name, x: familyDest.x, y: familyDest.y }
    : { label: fav.label, name: fav.name, x: fav.x, y: fav.y };

  let view: ReactNode;
  if (busAlert && busLeg) {
    view = (
      <BusAlightBanner
        alert={busAlert}
        stopName={busLeg.alightName}
        onAlighted={() => {
          setBusAlert(null);
          dispatch({ type: 'USER_ALIGHTED', now: now() });
        }}
        onDismiss={() => setBusAlert(null)}
      />
    );
  } else if (screen === 'GUIDE' && busAway && busLeg) {
    view = (
      <BusAwayScreen
        onReroute={() => {
          setBusAway(false);
          reroute();
        }}
        onDismiss={() => setBusAway(false)}
      />
    );
  } else if (screen === 'GUIDE' && warning.kind !== 'NONE') {
    view = (
      <MissedStopRecoveryBanner
        warning={warning}
        onReroute={reroute}
        onDismiss={() => setWarning({ kind: 'NONE' })}
      />
    );
  } else if (compassTarget) {
    view = (
      <CompassView
        target={compassTarget}
        speak={speakText}
        testMode={testMode}
        onClose={() => setCompassTarget(null)}
        onRoadview={familyGuide ? () => { setCompassTarget(null); setGuideOpen(true); } : undefined}
        onArrived={() => {
          setCompassTarget(null);
          setGuideOpen(false);
          if (screen === 'GUIDE' && sessionRef.current && !sessionRef.current.finished) {
            dispatch({ type: 'WALK_DONE', now: now() });
          } else if (role === 'elder') {
            relay.send('arrived', { name: compassTarget.name });
            setNotice('도착했어요');
          }
        }}
      />
    );
  } else if (guideOpen && familyGuide) {
    view = (
      <RoadviewGuide
        guide={familyGuide}
        speak={speakText}
        onClose={closeRoadview}
        onCompass={
          (relayDest ?? dest)
            ? () => {
                const d = relayDest ?? dest!;
                setCompassTarget({ name: d.name, lat: d.y, lng: d.x });
              }
            : undefined
        }
      />
    );
  } else if (screen === 'PLACE' && placeList) {
    view = (
      <PlaceConfirmScreen
        candidates={placeList}
        loading={loading}
        onPick={(p) => void searchRoutes({ name: p.name.slice(0, 30), x: p.lng, y: p.lat })}
        onBack={() => setScreen('HOME')}
      />
    );
  } else if (screen === 'CHOICE' && routes) {
    view = (
      <RouteChoiceScreen
        destName={dest?.name ?? '목적지'}
        routes={routes}
        onPick={pickRoute}
        onBack={() => setScreen(session ? 'GUIDE' : 'HOME')}
      />
    );
  } else if (screen === 'GUIDE' && session) {
    view = (
      <>
        <ActiveGuideScreen
          session={session}
          binding={binding}
          onBoarded={() => dispatch({ type: 'BOARDED', now: now() })}
          onAlighted={() => dispatch({ type: 'USER_ALIGHTED', now: now() })}
          onWalkDone={() => dispatch({ type: 'WALK_DONE', now: now() })}
          onReroute={reroute}
          onFinish={goHome}
          onBack={() => void quitGuide()}
          onCompass={setCompassTarget}
        />
        {loading && <p className="status" role="status">길을 다시 찾고 있어요…</p>}
        {error && <p className="status status--error" role="alert">{error}</p>}
      </>
    );
  } else {
    view = (
      <HomeScreen
        destination={homeDestination}
        resumeAvailable={pendingRestore?.state ? { destName: pendingRestore.state.destName } : null}
        originWarning={originLabel.startsWith('현재 위치') ? null : `${FALLBACK_LOCATION.name}에서 출발해요`}
        notice={notice}
        loading={loading || placeBusy}
        loadingText={placeBusy ? '장소를 찾고 있어요…' : '길을 찾고 있어요…'}
        error={error}
        onSubmit={(t) => void submitDestination(t, homeDestination)}
        onResume={() => {
          if (!pendingRestore?.state) return;
          apply({ state: pendingRestore.state, effects: pendingRestore.effects });
          setWarning(pendingRestore.warning);
          setPendingRestore(null);
          setScreen('GUIDE');
        }}
        onDiscardResume={() => {
          clearPersisted();
          setPendingRestore(null);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  }

  return (
    <div className="app app--elder">
      {sos}
      {view}
      {testMode && <DevTestPanel actions={devActions} info={devInfo} enabled={screen === 'GUIDE' && !!session} />}
    </div>
  );
}
