import { useState } from 'react';
import type { ClassifiedRoutes, ScoredRoute } from '../core/classifier/seniorRouteClassifier';
import { getLineVisual, BUS_VISUAL } from '../core/metadata/subwayLineVisuals';
import { normalizeLineKey } from '../core/metadata/stationTransferMetadata';

function RideChips({ route }: { route: ScoredRoute }) {
  const rides = route.candidate.segments.filter((s) => s.mode !== 'WALK');
  return (
    <div className="chips">
      {rides.map((s, i) => {
        const v = s.mode === 'SUBWAY' ? getLineVisual(s.lineName, s.subwayCode) : BUS_VISUAL;
        const label = s.mode === 'SUBWAY' ? normalizeLineKey(s.lineName) || '전철' : `${s.busNo ?? ''} 버스`;
        return (
          <span key={i} className="chip" style={{ background: v.bgHex, color: v.textHex }}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function RouteCard(props: { kind: 'comfort' | 'fast' | 'single'; route: ScoredRoute }) {
  const { route } = props;
  const title =
    props.kind === 'comfort' ? '🟢 편하게 걷기' : props.kind === 'fast' ? '🔵 빨리 가기' : '⭐ 가장 편하고 빠른 추천 길';
  return (
    <section className={`route-card route-card--${props.kind}`}>
      <h2>{title}</h2>
      {props.kind === 'comfort' && <p className="tag">기본 추천</p>}
      <p className="route-card__time">약 {Math.round(route.adjustedTotalMin)}분</p>
      <ul className="route-card__facts">
        <li>걷기 약 {Math.round(route.adjustedWalkMin)}분 (천천히 걷는 기준)</li>
        <li>갈아타기 {route.candidate.transferCount}번</li>
      </ul>
      <RideChips route={route} />
      {route.heavyTransfers.length > 0 && (
        <p className="warn">⚠ 오래 걷는 환승역: {route.heavyTransfers.join(', ')}</p>
      )}
      {props.kind !== 'comfort' && route.tightTransfer && <p className="warn">⚠ 갈아탈 시간이 촉박해요 (2분 이하)</p>}
    </section>
  );
}

/**
 * 길 고르기: 한 번에 한 길만 보여 주고 버튼은 2개.
 * 길이 둘이면 [이 길로 안내 시작] [다른 길 보기], 하나뿐이면 [이 길로 안내 시작] [처음으로].
 * (폰의 뒤로 버튼으로도 처음으로 돌아가요)
 */
export function RouteChoiceScreen(props: {
  destName: string;
  routes: ClassifiedRoutes;
  onPick: (r: ScoredRoute) => void;
  onBack: () => void;
}) {
  const { routes } = props;
  const [index, setIndex] = useState(0);
  const list: Array<{ kind: 'comfort' | 'fast' | 'single'; route: ScoredRoute }> =
    routes.kind === 'SINGLE'
      ? [{ kind: 'single', route: routes.best }]
      : [
          { kind: 'comfort', route: routes.comfort },
          { kind: 'fast', route: routes.fast },
        ];
  const cur = list[index % list.length];
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>{props.destName}</h1>
        <p className="muted">{list.length > 1 ? `가는 방법 ${(index % list.length) + 1} / ${list.length}` : '가는 방법'}</p>
      </header>
      <RouteCard kind={cur.kind} route={cur.route} />
      <div className="stack">
        <button className="btn btn--primary" onClick={() => props.onPick(cur.route)}>이 길로 안내 시작</button>
        {list.length > 1 ? (
          <button className="btn btn--secondary" onClick={() => setIndex((i) => (i + 1) % list.length)}>다른 길 보기</button>
        ) : (
          <button className="btn btn--secondary" onClick={props.onBack}>처음으로</button>
        )}
      </div>
    </main>
  );
}
