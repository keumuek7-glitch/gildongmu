import { useEffect, useRef, useState } from 'react';
import { compassGuide, fmtDist, nsewPositions, unwrapAngle, type LatLng } from '../core/navigation/compass';
import { useCompassSensors } from '../hooks/useCompassSensors';
import { vibrate } from '../services/speechAdapter';
import { isInsecurePage, PermissionHelpBox } from './PermissionHelpBox';

export interface CompassTarget extends LatLng {
  name: string;
}

/**
 * 동서남북 나침반: 휴대폰 윗부분이 향한 방향(heading)에 따라 글자판이 돌고,
 * 빨간 바늘은 늘 북쪽을 가리킵니다. 방향을 아직 모르면 흐리게만 보여 줍니다.
 */
function NorthDial({ heading }: { heading: number | null }) {
  const shown = useRef(0);
  if (heading != null) shown.current = unwrapAngle(shown.current, heading);
  const c = 50;
  return (
    <svg className={`north-dial${heading == null ? ' north-dial--wait' : ''}`} viewBox="0 0 100 100" role="img" aria-label="동서남북 나침반">
      <circle cx={c} cy={c} r="47" className="north-dial__face" />
      {nsewPositions(c, c, 31, shown.current).map((m) => (
        <text key={m.name} x={m.x.toFixed(1)} y={m.y.toFixed(1)} className={m.name === '북' ? 'north-dial__n' : undefined}>{m.name}</text>
      ))}
      <g transform={`rotate(${(-shown.current).toFixed(1)} ${c} ${c})`}>
        <path d="M50 50 L44 50 L50 20 L56 50 Z" className="north-dial__needle" />
        <path d="M50 50 L44 50 L50 80 L56 50 Z" className="north-dial__tail" />
      </g>
      <circle cx={c} cy={c} r="4" className="north-dial__pin" />
    </svg>
  );
}

/**
 * 나침반 화면 (기존 길동무와 같은 모양): 목적지가 늘 위, 내가 아래.
 * 방향이 맞으면 화면 전체가 초록 + "이쪽이에요".
 */
export function CompassView(props: {
  target: CompassTarget;
  onClose: () => void;
  onArrived: () => void;
  onRoadview?: () => void;
  speak?: (text: string) => void;
  /** 시험 버튼(가짜 위치·방향)을 보일지 */
  testMode?: boolean;
  /** 가족이 보낸 방향 색. 왼쪽=하늘색, 오른쪽=주황 (방향이 맞으면 늘 초록) */
  tint?: 'dest' | 'left' | 'right';
}) {
  const [sim, setSim] = useState<{ pos: LatLng | null; heading: number | null } | null>(null);
  const s = useCompassSensors(true, sim);
  const g = compassGuide(s.pos, s.heading, props.target);
  const aligned = g.status === 'ALIGNED';

  // 방향이 맞게 바뀌는 순간 짧게 진동
  const prevAligned = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevAligned.current === false && aligned) vibrate([120]);
    prevAligned.current = aligned;
  }, [aligned]);

  // 처음 한 번 안내 말
  const spoke = useRef(false);
  useEffect(() => {
    if (spoke.current || !props.speak) return;
    spoke.current = true;
    props.speak(`${props.target.name} 쪽으로 화살표를 따라가요`);
  }, [props]);

  const cx = 175;
  const cy = 205;
  const marks = g.targetBearing == null ? [] : nsewPositions(cx, cy, 165, g.targetBearing);

  // [로드뷰]가 아래 두 번째 버튼 자리를 쓰면 [← 뒤로]가 사라지므로, 그때는 왼쪽 위에 작은 [← 뒤로]를 둡니다.
  const roadviewShown = !!props.onRoadview && !s.needPermit;

  return (
    <div className={`compass ${aligned ? 'compass--aligned' : props.tint === 'left' || props.tint === 'right' ? `compass--tint-${props.tint}` : ''}`} role="dialog" aria-label="나침반">
      {roadviewShown && (
        <button className="btn btn--ghost compass__back" onClick={props.onClose}>← 뒤로</button>
      )}
      <div className="compass__top">
        <div className="compass__dest">🚩 {props.target.name}</div>
        <NorthDial heading={s.heading} />
      </div>
      <svg className="compass__svg" viewBox="0 0 350 440" role="img" aria-label="목적지 방향">
        <g className="compass__nsew">
          {marks.map((m) => (
            <text key={m.name} x={m.x.toFixed(1)} y={m.y.toFixed(1)}>{m.name}</text>
          ))}
        </g>
        <path d="M175 370 L 175 30" className="compass__path" />
        <path d="M150 50 L 175 12 L 200 50" className="compass__path" />
        <g transform={`rotate(${g.arrowRotate.toFixed(1)} 175 380)`}>
          <path d="M175 370 L 175 200" className="compass__arrow-line" />
          <path d="M138 236 L 175 184 L 212 236 Z" className="compass__arrow-head" />
        </g>
        <circle cx="175" cy="380" r="40" className="compass__me" />
        <text x="175" y="392" className="compass__me-tag">나</text>
      </svg>
      <p className="compass__msg" aria-live="polite">{g.text}</p>
      {g.distanceM != null && <p className="compass__dist">{fmtDist(g.distanceM)}</p>}
      {/* 막힌 게 있으면 어르신에게는 한 문장, 고치는 방법은 접힌 가족용 칸에 */}
      <PermissionHelpBox gps={s.gpsDenied} sensor={s.permDenied || s.noHeading} insecure={isInsecurePage()} />
      {/* 큰 버튼은 늘 2개 이하: 센서 허락이 필요하면 [나침반 켜기]+[뒤로], 아니면 [도착했어요]+[로드뷰 또는 뒤로(로드뷰가 없을 때)] */}
      <div className="compass__actions">
        {s.needPermit ? (
          <button className="btn btn--primary" onClick={() => void s.askPermission()}>나침반 켜기</button>
        ) : (
          <button className="btn btn--primary" onClick={props.onArrived}>도착했어요</button>
        )}
        {roadviewShown ? (
          <button className="btn btn--secondary" onClick={props.onRoadview}>로드뷰</button>
        ) : (
          <button className="btn btn--secondary" onClick={props.onClose}>← 뒤로</button>
        )}
      </div>

      {props.testMode && (
      <details className="settings compass__sim">
        <summary>🛠 시험: 가짜 위치·방향</summary>
        <button
          className="btn btn--ghost"
          onClick={() => setSim({ pos: { lat: props.target.lat - 0.003, lng: props.target.lng }, heading: sim?.heading ?? 0 })}
        >
          목적지 약 330m 남쪽에 서기
        </button>
        <label className="field">
          <span>휴대폰 방향 {sim?.heading ?? '-'}°</span>
          <input
            type="range"
            min={0}
            max={359}
            value={sim?.heading ?? 0}
            onChange={(e) => setSim({ pos: sim?.pos ?? s.pos, heading: Number(e.target.value) })}
          />
        </label>
        {sim && <button className="btn btn--ghost" onClick={() => setSim(null)}>실제 센서 쓰기</button>}
      </details>
      )}
    </div>
  );
}
