import { describe, expect, it, vi } from 'vitest';
import sample from '../src/data/sampleOdsayResponse.json';
import { DailyLimit, DAILY_ROUTE_LIMIT } from '../src/services/dailyLimit';
import { fetchOdsayDirect, routesFromBody, RouteApiError, ODSAY_URL } from '../src/services/routeApiClient';
import { coordKey, RouteCache, ROUTE_CACHE_MAX, ROUTE_CACHE_TTL_MS, type KeyValueStore } from '../src/services/routeCache';
import {
  createRouteService,
  DAILY_LIMIT_MESSAGE,
  pickProvider,
  sampleProvider,
  type RouteProvider,
} from '../src/services/routeService';

function memStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return {
    get: <T,>(k: string, d: T) => (m.has(k) ? (JSON.parse(JSON.stringify(m.get(k))) as T) : d),
    set: (k, v) => void m.set(k, JSON.parse(JSON.stringify(v))),
    del: (k) => void m.delete(k),
  };
}

const routes = routesFromBody(sample);
const at = (i: number) => ({ sx: 127.0 + i * 0.01, sy: 37.5, ex: 126.99, ey: 37.57 });

function setup(opts: { limit?: number; metered?: boolean; failWith?: Error } = {}) {
  const store = memStore();
  let t = new Date(2026, 10, 25, 10, 0, 0).getTime();
  const now = () => t;
  const fetch = vi.fn(async () => {
    if (opts.failWith) throw opts.failWith;
    return routes;
  });
  const provider: RouteProvider = { id: 'odsay-browser', metered: opts.metered ?? true, fetch };
  const cache = new RouteCache(store, now);
  const limit = new DailyLimit(store, now, opts.limit);
  const service = createRouteService({ getProvider: () => provider, cache, limit });
  return { service, fetch, cache, limit, advance: (ms: number) => void (t += ms) };
}

describe('길 저장(캐시)', () => {
  it('같은 길을 두 번 찾으면 바깥 서비스는 한 번만 부르고, 두 번째는 저장에서 꺼낸다', async () => {
    const { service, fetch, cache } = setup();
    const first = await service.getRoutes(at(0));
    const second = await service.getRoutes(at(0));
    expect(first.source).toBe('odsay-browser');
    expect(second.source).toBe('cache');
    expect(second.routes).toEqual(first.routes);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toEqual({ hit: 1, miss: 1 });
  });

  it('소수점 4자리까지 같으면 같은 길로 본다(좌표가 아주 조금 달라도)', () => {
    expect(coordKey({ sx: 127.00001, sy: 37.50002, ex: 126.99, ey: 37.57 })).toBe(
      coordKey({ sx: 127.00004, sy: 37.49998, ex: 126.99, ey: 37.57 }),
    );
    expect(coordKey(at(0))).not.toBe(coordKey(at(1)));
  });

  it('저장 기간이 지나면 다시 새로 찾는다', async () => {
    const { service, fetch, advance } = setup();
    await service.getRoutes(at(0));
    advance(ROUTE_CACHE_TTL_MS + 1000);
    const r = await service.getRoutes(at(0));
    expect(r.source).toBe('odsay-browser');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('저장은 최근 것 몇 곳만 남긴다', async () => {
    const { service, cache } = setup({ limit: 1000 });
    for (let i = 0; i < ROUTE_CACHE_MAX + 5; i++) await service.getRoutes(at(i));
    expect(cache.count()).toBe(ROUTE_CACHE_MAX);
    expect(cache.get(at(0))).toBeNull();
    expect(cache.get(at(ROUTE_CACHE_MAX + 4))).not.toBeNull();
  });

  it('지우면 저장해 둔 길이 사라진다', async () => {
    const { service, cache } = setup();
    await service.getRoutes(at(0));
    cache.clear();
    expect(cache.count()).toBe(0);
    expect(cache.get(at(0))).toBeNull();
  });

  it('실패한 길 찾기는 저장하지 않는다', async () => {
    const { service, cache } = setup({ failWith: new RouteApiError('TIMEOUT', 'x') });
    await expect(service.getRoutes(at(0))).rejects.toMatchObject({ kind: 'TIMEOUT' });
    expect(cache.count()).toBe(0);
  });
});

describe('하루 상한', () => {
  it('상한까지는 새로 찾고, 넘으면 친절한 안내와 함께 막는다', async () => {
    const { service, fetch, limit } = setup({ limit: 3 });
    await service.getRoutes(at(0));
    await service.getRoutes(at(1));
    await service.getRoutes(at(2));
    expect(limit.remaining()).toBe(0);
    const err = await service.getRoutes(at(3)).catch((e) => e);
    expect(err).toBeInstanceOf(RouteApiError);
    expect(err.kind).toBe('DAILY_LIMIT');
    expect(err.message).toBe(DAILY_LIMIT_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('상한을 다 써도 이미 저장해 둔 길은 그대로 볼 수 있고 횟수를 더 쓰지 않는다', async () => {
    const { service, limit } = setup({ limit: 1 });
    await service.getRoutes(at(0));
    expect(limit.remaining()).toBe(0);
    const r = await service.getRoutes(at(0));
    expect(r.source).toBe('cache');
    expect(limit.used()).toBe(1);
  });

  it('다음 날이 되면 다시 채워진다', async () => {
    const { service, limit, advance } = setup({ limit: 1 });
    await service.getRoutes(at(0));
    await expect(service.getRoutes(at(1))).rejects.toMatchObject({ kind: 'DAILY_LIMIT' });
    advance(26 * 60 * 60 * 1000);
    expect(limit.remaining()).toBe(1);
    await expect(service.getRoutes(at(1))).resolves.toMatchObject({ source: 'odsay-browser' });
  });

  it('실패해도 부른 횟수로 센다(바깥 서비스는 센 것으로 볼 수 있어서)', async () => {
    const { service, limit } = setup({ limit: 5, failWith: new RouteApiError('SERVER', 'x') });
    await service.getRoutes(at(0)).catch(() => undefined);
    expect(limit.used()).toBe(1);
  });

  it('처음 정한 하루 상한은 30번', () => {
    expect(DAILY_ROUTE_LIMIT).toBe(30);
  });
});

describe('길 가져오는 곳 고르기', () => {
  it('시연용 샘플은 횟수도 저장도 쓰지 않는다', async () => {
    const store = memStore();
    const cache = new RouteCache(store);
    const limit = new DailyLimit(store, Date.now, 1);
    const service = createRouteService({ getProvider: () => sampleProvider, cache, limit });
    const a = await service.getRoutes(at(0));
    await service.getRoutes(at(1));
    expect(a.source).toBe('sample');
    expect(a.routes.length).toBeGreaterThan(0);
    expect(limit.used()).toBe(0);
    expect(cache.count()).toBe(0);
  });

  it('키가 있으면 폰에서 바로, 없으면 샘플(Pages) 또는 프록시', () => {
    expect(pickProvider({ odsayKey: ' abc ', staticDemo: true }).id).toBe('odsay-browser');
    expect(pickProvider({ odsayKey: '', staticDemo: true }).id).toBe('sample');
    expect(pickProvider({ odsayKey: '  ', staticDemo: false }).id).toBe('proxy');
  });
});

describe('ODsay 직접 호출', () => {
  const coords = at(0);
  const okRes = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

  it('주소에 좌표와 키를 싣고(키의 특수문자는 인코딩) 응답을 길 후보로 바꾼다', async () => {
    const fetchImpl = vi.fn(async () => okRes(sample)) as unknown as typeof fetch;
    const key = 'ab+c/d=e';
    const r = await fetchOdsayDirect(coords, key, { fetchImpl });
    expect(r.length).toBeGreaterThan(0);
    const url = new URL((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string);
    expect(`${url.origin}${url.pathname}`).toBe(ODSAY_URL);
    expect(url.searchParams.get('apiKey')).toBe(key);
    expect(url.searchParams.get('SX')).toBe(String(coords.sx));
    expect(url.searchParams.get('EY')).toBe(String(coords.ey));
  });

  it('오류 문구에는 키가 들어가지 않는다(인터넷 끊김·시간 초과·서버 오류)', async () => {
    const key = 'SECRET-KEY-123';
    const cases: Array<[typeof fetch, string]> = [
      [(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, 'NETWORK'],
      [(async () => new Response('x', { status: 500 })) as unknown as typeof fetch, 'SERVER'],
    ];
    for (const [fetchImpl, kind] of cases) {
      const err = await fetchOdsayDirect(coords, key, { fetchImpl }).catch((e) => e);
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(key);
    }
    const abort = (async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }) as unknown as typeof fetch;
    const timeout = await fetchOdsayDirect(coords, key, { fetchImpl: abort }).catch((e) => e);
    expect(timeout.kind).toBe('TIMEOUT');
    expect(timeout.message).not.toContain(key);
  });

  it('429는 요청이 많다는 안내로, ODsay가 error를 주면 길 없음 안내로 바꾼다', async () => {
    const tooMany = (async () => new Response('', { status: 429, headers: { 'Retry-After': '7' } })) as unknown as typeof fetch;
    const e1 = await fetchOdsayDirect(coords, 'k', { fetchImpl: tooMany }).catch((e) => e);
    expect(e1).toMatchObject({ kind: 'RATE_LIMITED', retryAfterSec: 7 });

    const withError = (async () => okRes({ error: { code: '-98', msg: '출발지와 도착지가 너무 가까워요' } })) as unknown as typeof fetch;
    const e2 = await fetchOdsayDirect(coords, 'k', { fetchImpl: withError }).catch((e) => e);
    expect(e2).toMatchObject({ kind: 'NO_ROUTE' });
    expect(e2.message).toContain('너무 가까워요');
  });
});
