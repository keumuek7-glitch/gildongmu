import { useState } from 'react';
import type { ClassifiedRoutes, ScoredRoute } from '../core/classifier/seniorRouteClassifier';
import { routeKindLabel } from '../core/classifier/routeKindLabel';

function RouteCard(props: { kind: 'comfort' | 'fast' | 'single'; route: ScoredRoute }) {
  const { route } = props;
  const name = props.kind === 'comfort' ? '🟢 편하게 걷기' : props.kind === 'fast' ? '🔵 빨리 가기' : '⭐ 추천 길';
  // 전철 / 버스 / 전철+버스 중 어떤 길인지도 한 줄에 같이 보여 줘요
  const kind = routeKindLabel(route.candidate);
  return (
    <section className={`route-card route-card--${props.kind}`}>
      <h2 className="route-card__line">{name}{kind ? ` · ${kind}` : ''} · 약{' '}{Math.round(route.adjustedTotalMin)}분</h2>
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
        <p className="muted">{props.destName}</p>
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
