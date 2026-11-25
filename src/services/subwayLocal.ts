import type { RouteCandidate } from '../core/types';
import type { SubwayGraph } from '../core/subwayGraphTypes';
import type { Coords } from './routeApiClient';
import { createSubwayRouter, type SubwayRouter } from './subwayRouter';

let routerPromise: Promise<SubwayRouter> | null = null;

/** 서울 지하철 지도는 처음 길을 찾을 때 한 번만 불러옵니다(앱 처음 열 때 느려지지 않게). */
function loadRouter(): Promise<SubwayRouter> {
  routerPromise ??= import('../data/subwayGraph.json')
    .then((m) => createSubwayRouter(m.default as unknown as SubwayGraph))
    .catch((e) => {
      routerPromise = null;
      throw e;
    });
  return routerPromise;
}

export async function findLocalSubwayRoutes(c: Coords): Promise<RouteCandidate[] | null> {
  const router = await loadRouter();
  return router.findRoutes(c);
}
