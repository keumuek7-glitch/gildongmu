import { useEffect, useState, type ReactNode } from 'react';
import { DIR8, PHRASES, PHRASE_MAX, dirName, layoutFamilyMap } from '../core/family/familyMap';
import { bearingDeg, fmtDist, norm360, type LatLng } from '../core/navigation/compass';
import type { LatLngPlace, TripData } from '../core/guardian/familyRelay';
import { kakaoReason, loadKakao, searchPlaces, getKakaoKey, setKakaoKey, type PlaceResult } from '../services/kakaoMaps';

export interface ElderLoc {
  lat: number;
  lng: number;
  t: number;
  heading?: number | null;
}

export interface GuideToSend {
  lat: number;
  lng: number;
  pan: number;
  phrase: string;
  t: number;
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 목적지가 늘 위로 오게 돌린 약도 */
function FamilyMap({ elder, dest }: { elder: ElderLoc; dest: LatLngPlace | null }) {
  const L = layoutFamilyMap(elder, dest);
  const { W, H } = L;
  const e = L.elder;
  return (
    <svg className="family-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="어르신 위치 약도">
      {!L.dest && (
        <text x={W / 2} y={34} textAnchor="middle" fontSize="17" fontWeight="700" fill="#555">도착지를 넣으면 방향이 보여요</text>
      )}
      {L.headingRotate != null && L.dest && (
        <path
          d={`M${e.x} ${e.y} L ${e.x - 16} ${e.y - 46} A 48 48 0 0 1 ${e.x + 16} ${e.y - 46} Z`}
          fill="#1546C8"
          opacity="0.22"
          transform={`rotate(${L.headingRotate.toFixed(1)} ${e.x} ${e.y})`}
        />
      )}
      {L.dest && dest && (
        <>
          <path className="blink" d={`M${e.x} ${e.y - 26} L ${e.x} ${L.dest.y + 26}`} stroke="#1546C8" strokeWidth="8" strokeDasharray="14 10" strokeLinecap="round" fill="none" />
          <path className="blink" d={`M${e.x - 20} ${L.dest.y + 46} L ${e.x} ${L.dest.y + 18} L ${e.x + 20} ${L.dest.y + 46}`} stroke="#1546C8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x={e.x - 70} y={6} width={140} height={32} rx={8} fill="#15803D" />
          <text x={e.x} y={28} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="900">{dest.name.slice(0, 8)}</text>
          {L.distanceM != null && (
            <text x={e.x + 14} y={(e.y + L.dest.y) / 2} fontSize="16" fontWeight="700" fill="#333">{fmtDist(L.distanceM)}</text>
          )}
          <g opacity="0.7" transform={`rotate(${L.northRotate.toFixed(1)} ${W - 30} 30)`}>
            <circle cx={W - 30} cy={30} r={18} fill="#fff" stroke="#bbb" />
            <path d={`M${W - 30} 30 L ${W - 30} 17`} stroke="#777" strokeWidth="3" strokeLinecap="round" />
            <text x={W - 30} y={9} fontSize="13" fontWeight="700" fill="#777" textAnchor="middle">북</text>
          </g>
        </>
      )}
      <circle cx={e.x} cy={e.y} r={16} fill="#1546C8" stroke="#fff" strokeWidth="5" />
      <rect x={e.x - 40} y={e.y + 20} width={80} height={26} rx={8} fill="#111" />
      <text x={e.x} y={e.y + 39} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">어르신</text>
    </svg>
  );
}

/** 방향(8방향 다이얼 + 15° 조정)과 한 마디를 골라 어르신 폰에 보냄 */
function DirectionSender(props: { elder: ElderLoc; dest: LatLngPlace | null; onSend: (g: GuideToSend) => void; onClose: () => void }) {
  const destPan = () => (props.dest ? Math.round(bearingDeg(props.elder, props.dest)) : Math.round(props.elder.heading ?? 0));
  const [pan, setPan] = useState(destPan);
  const [phrase, setPhrase] = useState<string>(PHRASES[0]);
  const [custom, setCustom] = useState('');
  const finalPhrase = (custom.trim() || phrase).slice(0, PHRASE_MAX);
  return (
    <div className="card">
      <p className="card__title">가야 할 쪽을 골라 주세요</p>
      <svg className="dial" viewBox="0 0 200 200" role="img" aria-label={`${dirName(pan)}쪽 ${pan}도`}>
        <circle cx="100" cy="100" r="88" fill="none" stroke="#bbb" strokeWidth="4" />
        {DIR8.filter((_, i) => i % 2 === 0).map((n, i) => {
          const a = (i * 90 * Math.PI) / 180;
          return <text key={n} x={100 + 74 * Math.sin(a)} y={100 - 74 * Math.cos(a) + 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#777">{n}</text>;
        })}
        <g transform={`rotate(${pan} 100 100)`}>
          <path d="M100 160 L 100 40" stroke="#1546C8" strokeWidth="10" strokeLinecap="round" />
          <path d="M80 62 L 100 34 L 120 62" stroke="#1546C8" strokeWidth="10" strokeLinecap="round" fill="none" />
        </g>
      </svg>
      <p className="hint">{dirName(pan)}쪽 {pan}°</p>
      <div className="direction-check__answers">
        <button className="btn btn--secondary" onClick={() => setPan(norm360(pan - 15))}>왼쪽</button>
        <button className="btn btn--secondary" onClick={() => setPan(destPan())}>목적지 쪽</button>
        <button className="btn btn--secondary" onClick={() => setPan(norm360(pan + 15))}>오른쪽</button>
      </div>
      <p className="card__title">한 마디 고르기</p>
      <div className="chips">
        {PHRASES.map((p) => (
          <button key={p} className={`chip ${!custom.trim() && phrase === p ? 'chip--on' : ''}`} onClick={() => { setPhrase(p); setCustom(''); }}>{p}</button>
        ))}
      </div>
      <label className="field">
        <span>직접 쓰기 ({PHRASE_MAX}자까지)</span>
        <input maxLength={PHRASE_MAX} value={custom} onChange={(e) => setCustom(e.target.value)} />
      </label>
      <button
        className="btn btn--primary"
        onClick={() =>
          props.onSend({ lat: +props.elder.lat.toFixed(6), lng: +props.elder.lng.toFixed(6), pan: Math.round(pan), phrase: finalPhrase, t: Date.now() })
        }
      >
        “{finalPhrase}” 보내기
      </button>
      <button className="btn btn--ghost" onClick={props.onClose}>닫기</button>
    </div>
  );
}

/** 시험용 목적지 (좌표는 대략값, 앱의 즐겨찾기와 같음) */
const SAMPLE_DEST: LatLngPlace = { name: '서울대학교병원', lat: 37.5797, lng: 126.999 };

/**
 * 가족 화면: 어르신 위치 약도, 목적지 찾아 보내기, 방향 안내 보내기.
 */
export function FamilyScreen(props: {
  elderLoc: ElderLoc | null;
  trip: TripData | null;
  news: string | null;
  paired: boolean;
  onSendTrip: (trip: TripData) => void;
  onResetTrip: () => void;
  onSendGuide: (g: GuideToSend) => void | Promise<void>;
  children?: ReactNode;
}) {
  const loc = props.elderLoc;
  const dest = props.trip?.dest ?? null;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searchNote, setSearchNote] = useState('');
  const [sending, setSending] = useState(false);
  const [keyDraft, setKeyDraft] = useState(getKakaoKey);
  const [, tick] = useState(0);

  // "몇 분 전" 표시를 10초마다 새로
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const search = async () => {
    const text = q.trim();
    if (!text) return;
    setSearchNote('찾는 중');
    try { await loadKakao(); } catch { /* 아래에서 이유 */ }
    const list = await searchPlaces(text);
    if (list === null) {
      setResults(null);
      setSearchNote(getKakaoKey() ? kakaoReason() : '장소 찾기는 카카오 키를 넣으면 돼요 (아래 설정)');
      return;
    }
    setResults(list);
    setSearchNote(list.length ? '' : '찾는 곳이 없어요');
  };

  const pick = (p: LatLngPlace) => {
    props.onSendTrip({ from: null, stop: null, dest: { name: p.name.slice(0, 30), lat: p.lat, lng: p.lng } });
    setResults(null);
    setQ('');
    setSearchNote('');
  };

  const stale = loc ? Date.now() - loc.t > 60_000 : false;
  const dest2: LatLng | null = dest;

  return (
    <main className="screen">
      <header className="screen__header">
        <h1>어르신 지금 위치</h1>
        <p className={`muted ${stale ? 'warn' : ''}`}>
          {loc ? `${fmtTime(loc.t)} 받음${stale ? ' (오래됨)' : ''}` : '아직 위치를 못 받았어요'}
        </p>
      </header>

      {props.news && (
        <div className="banner banner--info" role="status">
          <p className="banner__title">{props.news}</p>
        </div>
      )}

      <div className="card">
        <p className="card__title">도착지</p>
        {dest ? (
          <>
            <p className="big">🚩 {dest.name}</p>
            <p className="hint">{props.paired ? '어르신 휴대폰에 보냈어요. 어르신 홈에 “이 곳으로 길 찾기”가 떠요' : '휴대폰 연결 전이라 아직 못 보냈어요'}</p>
            <button className="btn btn--ghost" onClick={props.onResetTrip}>도착지 지우기</button>
          </>
        ) : (
          <>
            <label className="field">
              <span>어디로 가시나요?</span>
              <input
                value={q}
                placeholder="예: 서울대학교병원"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void search(); }}
              />
            </label>
            <button className="btn btn--primary" onClick={() => void search()}>장소 찾기</button>
            {searchNote && <p className="hint">{searchNote}</p>}
            {results && results.length > 0 && (
              <div className="stack">
                {results.map((r, i) => (
                  <button key={`${r.name}-${i}`} className="btn btn--favorite" onClick={() => pick(r)}>
                    <span className="btn__label">{r.name}</span>
                    <span className="btn__sub">{r.addr}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn--ghost" onClick={() => pick(SAMPLE_DEST)}>예시 도착지 넣기 (서울대학교병원, 좌표 대략값)</button>
          </>
        )}
      </div>

      {loc ? (
        <>
          <FamilyMap elder={loc} dest={dest} />
          <a
            className="btn btn--secondary"
            href={`https://map.kakao.com/link/map/${encodeURIComponent('어르신')},${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`}
            target="_blank"
            rel="noreferrer"
          >
            카카오맵에서 위치 보기
          </a>
          {sending ? (
            <DirectionSender
              elder={loc}
              dest={dest}
              onClose={() => setSending(false)}
              onSend={(g) => { props.onSendGuide(g); setSending(false); }}
            />
          ) : (
            <button className="btn btn--primary" onClick={() => setSending(true)}>방향 안내 보내기</button>
          )}
        </>
      ) : (
        <p className="muted">어르신 위치를 받으면 약도와 방향 안내 보내기가 나와요</p>
      )}
      {dest2 && !loc && <p className="hint">도착지는 보냈어요. 어르신이 “내 위치 보내기”를 누르면 약도가 떠요</p>}

      {props.children}

      <details className="settings">
        <summary>장소 찾기 설정 (카카오 키)</summary>
        <label className="field">
          <span>카카오 JavaScript 키</span>
          <input value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn--secondary" onClick={() => setKakaoKey(keyDraft)}>저장</button>
      </details>
    </main>
  );
}
