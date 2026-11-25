import type { RouteCandidate } from '../core/types';
import { fetchOdsayDirect, fetchSeniorRoutes, routesFromBody, RouteApiError, type Coords } from './routeApiClient';
import type { DailyLimit } from './dailyLimit';
import type { RouteCache } from './routeCache';

/**
 * 길 찾기는 앱 어디서든 이 파일의 getRoutes 한 군데로만 부릅니다.
 * 길을 가져오는 곳(RouteProvider)은 갈아 끼울 수 있어서, 나중에 서울시 공공자료로 앱이 직접 길을 계산하는 방식(A안)을
 * provider 하나로 추가하고 이 파일의 나머지(저장·하루 상한)는 그대로 둡니다.
 */
export type RouteSource = 'cache' | 'sample' | 'proxy' | 'odsay-browser' | 'subway-local' | 'walk-local';

export interface RouteProvider {
  readonly id: Exclude<RouteSource, 'cache'>;
  /** true면 바깥 서비스를 부르는 곳이라 하루 상한과 저장을 적용합니다. */
  readonly metered: boolean;
  fetch(c: Coords): Promise<RouteCandidate[]>;
}

export interface RouteResult { routes: RouteCandidate[]; source: RouteSource }

export const DAILY_LIMIT_MESSAGE =
  '오늘은 길 찾기를 모두 썼어요. 내일 다시 찾을 수 있어요. 급하면 가족에게 길을 보내 달라고 해 주세요.';

export const sampleProvider: RouteProvider = {
  id: 'sample',
  metered: false,
  async fetch() {
    const sample = (await import('../data/sampleOdsayResponse.json')).default;
    return routesFromBody(sample);
  },
};

export const proxyProvider: RouteProvider = {
  id: 'proxy',
  metered: true,
  fetch: (c) => fetchSeniorRoutes(c),
};

export function odsayBrowserProvider(apiKey: string): RouteProvider {
  return { id: 'odsay-browser', metered: true, fetch: (c) => fetchOdsayDirect(c, apiKey) };
}

/** 설정에 길 찾기 키가 있으면 폰에서 바로, 없으면 시연용 샘플(Pages 빌드) 또는 프록시(개발) */
export function pickProvider(opts: { odsayKey: string; staticDemo: boolean }): RouteProvider {
  const key = opts.odsayKey.trim();
  if (key) return odsayBrowserProvider(key);
  return opts.staticDemo ? sampleProvider : proxyProvider;
}

/**
 * 앱이 직접 계산해 보는 길(서울 지하철). 못 찾으면 null 을 돌려주고, 이때는 아래의 바깥 길 찾기로 넘어갑니다.
 * 앱 안의 계산이라 저장도, 하루 상한도, 바깥 호출 횟수도 쓰지 않습니다. 계산 중 오류가 나도 길 찾기를 막지 않습니다.
 */
export type LocalRouteFinder = (c: Coords) => Promise<RouteCandidate[] | null>;

export function createRouteService(deps: {
  getProvider: () => RouteProvider;
  cache: RouteCache;
  limit: DailyLimit;
  local?: LocalRouteFinder;
  /** 가까운 곳(1km 안쪽)은 걷는 길만 앱이 직접 만듭니다. 지하철 계산보다 먼저 봅니다. */
  walk?: LocalRouteFinder;
}) {
  async function getRoutes(c: Coords): Promise<RouteResult> {
    if (deps.walk) {
      try {
        const own = await deps.walk(c);
        if (own && own.length > 0) return { routes: own, source: 'walk-local' };
      } catch {
        // 걷는 길 계산이 실패해도 아래로 계속 갑니다.
      }
    }
    if (deps.local) {
      try {
        const own = await deps.local(c);
        if (own && own.length > 0) return { routes: own, source: 'subway-local' };
      } catch {
        // 내부 계산이 실패해도 아래 바깥 길 찾기로 계속 갑니다.
      }
    }
    const provider = deps.getProvider();
    if (!provider.metered) return { routes: await provider.fetch(c), source: provider.id };

    const saved = deps.cache.get(c);
    if (saved) {
      deps.cache.recordHit();
      return { routes: saved, source: 'cache' };
    }
    if (deps.limit.remaining() <= 0) throw new RouteApiError('DAILY_LIMIT', DAILY_LIMIT_MESSAGE);

    deps.limit.record();
    deps.cache.recordMiss();
    const routes = await provider.fetch(c);
    deps.cache.put(c, routes);
    return { routes, source: provider.id };
  }

  return { getRoutes };
}
