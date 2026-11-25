import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeScreen, type Favorite } from './screens/HomeScreen';
import { RouteChoiceScreen } from './screens/RouteChoiceScreen';
import { ActiveGuideScreen } from './screens/ActiveGuideScreen';
import { MissedStopRecoveryBanner } from './components/MissedStopRecoveryBanner';
import { SafetyBar } from './components/SafetyBar';
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
import { currentTransitVM } from './core/stateMachine/transitStateMachine';
import { reconcileSession, type ReconcileResult, type ReconcileWarning } from './core/stateMachine/sessionTimeReconciler';
import { decodeGuardianLink } from './core/guardian/guardianLinkCodec';
import { buildSmsUri, buildSosMessage } from './core/guardian/sosMessageBuilder';
import { fetchSeniorRoutesOrSample, RouteApiError, STATIC_DEMO } from './services/routeApiClient';
import { createWebSpeechAdapter, vibrate } from './services/speechAdapter';
import { getCurrentLocation, FALLBACK_LOCATION } from './utils/currentLocationHelper';
import { loadPersistedSession, usePersistedMultiLegSession } from './hooks/usePersistedMultiLegSession';
import {
  buildPairLink,
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
import { PairingPanel } from './components/PairingPanel';
import { CompassView, type CompassTarget } from './components/CompassView';
import { RoadviewGuide, sanitizeGuide, type FamilyGuide } from './components/RoadviewGuide';
import { getKakaoKey, setKakaoKey } from './services/kakaoMaps';
import { useBusProximityAlert } from './hooks/useBusProximityAlert';
import { BusAlightBanner } from './components/BusAlightBanner';
import { sanitizeNearM, type AlightAlert } from './core/navigation/proximityAlight';

type Screen = 'HOME' | 'CHOICE' | 'GUIDE';
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
function readInitialRole(): { role: Role | null; pairedNow: boolean } {
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
  return { role, pairedNow: !!pair };
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
  const [compassTarget, setCompassTarget] = useState<CompassTarget | null>(null);
  const [familyGuide, setFamilyGuide] = useState<FamilyGuide | null>(() => sanitizeGuide(relay.last('guide')?.data));
  const [guideOpen, setGuideOpen] = useState(false);
  const [kakaoKeyDraft, setKakaoKeyDraft] = useState(getKakaoKey);
  const [elderLoc, setElderLoc] = useState<ElderLoc | null>(() => (relay.last<ElderLoc>('elderLoc')?.data ?? null));
  const [screen, setScreen] = useState<Screen>('HOME');
  const [session, setSession] = useState<MultiLegState | null>(null);
  const sessionRef = useRef<MultiLegState | null>(null);
  const [routes, setRoutes] = useState<ClassifiedRoutes | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [originLabel, setOriginLabel] = useState('현재 위치 (길 찾기 때 확인)');
  const [warning, setWarning] = useState<ReconcileWarning>({ kind: 'NONE' });
  const [pendingRestore, setPendingRestore] = useState<ReconcileResult | null>(null);
  const [guardianPhone, setGuardianPhone] = useState(readPhone);
  const [sosBusy, setSosBusy] = useState(false);
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

  const sendMyLocation = useCallback(async () => {
    const loc = await getCurrentLocation(8000);
    if (loc.source !== 'GPS') {
      setNotice('위치를 못 찾았어요. 위치 권한을 켜 주세요');
      return;
    }
    relay.send('elderLoc', { lat: loc.y, lng: loc.x, t: Date.now(), shout: true });
    setNotice(relay.isPaired() ? '가족에게 위치를 보냈어요' : '가족 휴대폰과 아직 연결 안 됐어요');
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
        const candidates = await fetchSeniorRoutesOrSample({ sx: loc.x, sy: loc.y, ex: target.x, ey: target.y });
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

  // ── 보호자 위치 전송(SOS) ─────────────────────────────
  const sendSos = useCallback(async () => {
    setSosBusy(true);
    try {
      const loc = await getCurrentLocation(5000);
      const s = sessionRef.current;
      const leg = s ? currentLeg(s) : undefined;
      const step = s && leg && isRideLeg(leg) && s.transit ? currentTransitVM(leg, s.transit).title : undefined;
      const body = buildSosMessage({
        lat: loc.y,
        lng: loc.x,
        approximate: loc.source !== 'GPS',
        destName: s?.destName ?? dest?.name,
        currentStep: step,
      });
      window.location.href = buildSmsUri(guardianPhone, body, navigator.userAgent);
    } finally {
      setSosBusy(false);
    }
  }, [dest, guardianPhone]);

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
      setBusAway(true);
      vibrate([500, 200, 500]);
      speech.speak(`${leg.alightName}에서 멀어지고 있어요. 반대로 가는 것 같아요. 다음 정류장에서 내려서 길을 다시 찾아요`);
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
        setBusSimM(1000);
        setTimeout(() => setBusSimM(1400), 300);
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

  const pairingPanel = role && (
    <PairingPanel
      role={role}
      paired={paired}
      state={relayState}
      onMakeLink={
        role === 'child'
          ? () => {
              const room = relay.ensureRoom();
              setPaired(true);
              const t = relay.last('trip');
              if (t) relay.send('trip', t.data);
              return buildPairLink(window.location.href, room, 'elder');
            }
          : undefined
      }
      onUnpair={() => {
        relay.leave();
        setPaired(false);
      }}
      onChangeRole={() => pickRole(role === 'elder' ? 'child' : 'elder')}
    />
  );

  if (!role) return <div className="app"><RoleSelectScreen onPick={pickRole} /></div>;

  if (role === 'child') {
    return (
      <div className="app">
        <FamilyScreen elderLoc={elderLoc} news={notice}>{pairingPanel}</FamilyScreen>
      </div>
    );
  }

  return (
    <div className={`app ${screen === 'GUIDE' ? 'app--with-safety' : ''}`}>
      {screen === 'HOME' && (
        <HomeScreen
          favorites={FAVORITES}
          guardianDest={relayDest ?? guardianDest}
          resumeAvailable={pendingRestore?.state ? { destName: pendingRestore.state.destName } : null}
          originLabel={originLabel}
          guardianPhone={guardianPhone}
          loading={loading}
          error={error}
          onGo={(d) => void searchRoutes(d)}
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
          onSavePhone={(p) => {
            setGuardianPhone(p);
            try { localStorage.setItem(PHONE_KEY, p); } catch { /* noop */ }
          }}
        />
      )}

      {screen === 'HOME' && (
        <div className="screen">
          {STATIC_DEMO && <p className="hint">지금은 시연용 샘플 길(청량리역 → 서울대병원)만 보여 줘요. 실제 길 찾기는 준비 중이에요.</p>}
          {notice && <p className="status" role="status">{notice}</p>}
          {familyGuide && (
            <button className="btn btn--secondary" onClick={() => setGuideOpen(true)}>가족이 보낸 길 안내 보기</button>
          )}
          <button className="btn btn--secondary" onClick={() => void sendMyLocation()}>내 위치 가족에게 보내기</button>
          {pairingPanel}
          <details className="settings">
            <summary>로드뷰 설정 (카카오 키)</summary>
            <label className="field">
              <span>카카오 JavaScript 키</span>
              <input value={kakaoKeyDraft} onChange={(e) => setKakaoKeyDraft(e.target.value)} autoComplete="off" />
            </label>
            <button
              className="btn btn--secondary"
              onClick={() => {
                setKakaoKey(kakaoKeyDraft);
                setNotice('카카오 키를 저장했어요');
              }}
            >
              저장
            </button>
          </details>
        </div>
      )}

      {screen === 'CHOICE' && routes && (
        <RouteChoiceScreen
          destName={dest?.name ?? '목적지'}
          routes={routes}
          onPick={pickRoute}
          onBack={() => setScreen(session ? 'GUIDE' : 'HOME')}
        />
      )}

      {screen === 'GUIDE' && session && (
        <>
          <MissedStopRecoveryBanner
            warning={warning}
            onReroute={reroute}
            onDismiss={() => setWarning({ kind: 'NONE' })}
          />
          <ActiveGuideScreen
            session={session}
            binding={binding}
            onBoarded={() => dispatch({ type: 'BOARDED', now: now() })}
            onAlighted={() => dispatch({ type: 'USER_ALIGHTED', now: now() })}
            onWalkDone={() => dispatch({ type: 'WALK_DONE', now: now() })}
            onReroute={reroute}
            onFinish={goHome}
            onCompass={setCompassTarget}
          />
          {busAway && busLeg && !busAlert && (
            <div className="banner banner--warning" role="alert">
              <p className="banner__title">반대로 가는 것 같아요</p>
              <p>{busLeg.alightName}에서 멀어지고 있어요. 다음 정류장에서 내려서 길을 다시 찾아요.</p>
              <button className="btn btn--primary" onClick={() => { setBusAway(false); reroute(); }}>
                지금 위치에서 길 다시 찾기
              </button>
              <button className="btn btn--secondary" onClick={() => setBusAway(false)}>괜찮아요, 맞게 가고 있어요</button>
            </div>
          )}
          {busAlert && busLeg && (
            <BusAlightBanner
              alert={busAlert}
              stopName={busLeg.alightName}
              onAlighted={() => {
                setBusAlert(null);
                dispatch({ type: 'USER_ALIGHTED', now: now() });
              }}
              onDismiss={() => setBusAlert(null)}
            />
          )}
          {loading && <p className="status" role="status">길을 다시 찾고 있어요…</p>}
          {error && <p className="status status--error" role="alert">{error}</p>}
        </>
      )}

      {guideOpen && familyGuide && !compassTarget && (
        <RoadviewGuide
          guide={familyGuide}
          speak={speakText}
          onClose={() => setGuideOpen(false)}
          onCompass={
            (relayDest ?? dest)
              ? () => {
                  const d = relayDest ?? dest!;
                  setCompassTarget({ name: d.name, lat: d.y, lng: d.x });
                }
              : undefined
          }
        />
      )}

      {compassTarget && (
        <CompassView
          target={compassTarget}
          speak={speakText}
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
      )}

      <DevTestPanel actions={devActions} info={devInfo} enabled={screen === 'GUIDE' && !!session} />

      {screen === 'GUIDE' && (
        <SafetyBar
          onOtherRoute={() => (routes ? setScreen('CHOICE') : reroute())}
          onSos={() => void sendSos()}
          sosBusy={sosBusy}
        />
      )}
    </div>
  );
}
