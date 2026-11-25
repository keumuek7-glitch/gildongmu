import { describe, expect, it, vi } from 'vitest';
import sample from '../src/data/sampleOdsayResponse.json';
import { findWalkOnlyRoute } from '../src/services/walkRouter';
import { metersBetween } from '../src/services/subwayRouter';
import { createRouteService, type RouteProvider } from '../src/services/routeService';
import { routesFromBody } from '../src/services/routeApiClient';
import { RouteCache, type KeyValueStore } from '../src/services/routeCache';
import { DailyLimit } from '../src/services/dailyLimit';
import { buildRouteLegs, isRideLeg, type WalkLeg } from '../src/core/stateMachine/routeLegBuilder';
import { createMultiLegState, multiLegReducer } from '../src/core/stateMachine/multiLegManager';
import { classifyRoutes } from '../src/core/classifier/seniorRouteClassifier';
import { routeKindLabel } from '../src/core/classifier/routeKindLabel';
import { walkVM } from '../src/core/tts/guidanceSpeechBuilder';

// 청량리역 부근 → 약 500m 북쪽(위도 0.0045도 ≈ 500m)
const NEAR = { sx: 127.0469, sy: 37.5803, ex: 127.0469, ey: 37.5848 };
// 청량리역 → 혜화역 부근(약 4km)
const FAR = { sx: 127.0469, sy: 37.5803, ex: 127.0019, ey: 37.5822 };

function memStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return {
    get: <T,>(k: string, d: T) => (m.has(k) ? (JSON.parse(JSON.stringify(m.get(k))) as T) : d),
    set: (k, v) => void m.set(k, JSON.parse(JSON.stringify(v))),
    del: (k) => void m.delete(k),
  };
}

describe('가까운 곳(1km 안쪽)은 걸어서 가는 길', () => {
  it('1km보다 가까우면 걷는 길 하나를 만든다 (직선 × 1.3, 1분에 67m)', () => {
    const straight = metersBetween(NEAR.sx, NEAR.sy, NEAR.ex, NEAR.ey);
    expect(straight).toBeGreaterThan(480);
    expect(straight).toBeLessThan(520);
    const r = findWalkOnlyRoute(NEAR)!;
    expect(r).toHaveLength(1);
    const c = r[0];
    expect(c.segments).toEqual([{ mode: 'WALK', durationMin: c.totalTimeMin, distanceM: c.walkDistanceM }]);
    expect(c.walkDistanceM).toBe(Math.round((straight * 1.3) / 10) * 10);
    expect(c.totalTimeMin).toBe(Math.ceil(c.walkDistanceM / 67));
    expect(c.transferCount).toBe(0);
  });

  it('1km 이상이거나 좌표가 이상하면 null (다른 길 찾기로 넘김)', () => {
    expect(findWalkOnlyRoute(FAR)).toBeNull();
    expect(findWalkOnlyRoute({ ...NEAR, ex: Number.NaN })).toBeNull();
  });

  it('바로 옆이어도 10m, 1분은 보여 준다', () => {
    const c = findWalkOnlyRoute({ ...NEAR, ex: NEAR.sx, ey: NEAR.sy })![0];
    expect(c.walkDistanceM).toBe(10);
    expect(c.totalTimeMin).toBe(1);
  });
});

describe('길찾기 입구에서 걷는 길을 가장 먼저 본다', () => {
  function setup() {
    const store = memStore();
    const fetch = vi.fn(async () => routesFromBody(sample));
    const provider: RouteProvider = { id: 'odsay-browser', metered: true, fetch };
    const local = vi.fn(async () => null);
    const limit = new DailyLimit(store);
    const cache = new RouteCache(store);
    const service = createRouteService({
      getProvider: () => provider,
      cache,
      limit,
      local,
      walk: async (c) => findWalkOnlyRoute(c),
    });
    return { service, fetch, local, limit, cache };
  }

  it('가까우면 walk-local: 지하철 계산·바깥 호출·하루 횟수·저장 모두 안 씀', async () => {
    const { service, fetch, local, limit, cache } = setup();
    const r = await service.getRoutes(NEAR);
    expect(r.source).toBe('walk-local');
    expect(local).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(limit.used()).toBe(0);
    expect(cache.count()).toBe(0);
  });

  it('멀면 지금까지처럼 지하철 계산 → 바깥 길 찾기로 간다', async () => {
    const { service, fetch, local } = setup();
    const r = await service.getRoutes(FAR);
    expect(local).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r.source).toBe('odsay-browser');
  });

  it('걷는 길 계산이 오류를 내도 길 찾기는 멈추지 않는다', async () => {
    const store = memStore();
    const provider: RouteProvider = { id: 'odsay-browser', metered: true, fetch: vi.fn(async () => routesFromBody(sample)) };
    const service = createRouteService({
      getProvider: () => provider,
      cache: new RouteCache(store),
      limit: new DailyLimit(store),
      walk: async () => {
        throw new Error('oops');
      },
    });
    await expect(service.getRoutes(NEAR)).resolves.toMatchObject({ source: 'odsay-browser' });
  });
});

describe('걷기만 하는 길도 화면·안내가 그대로 동작', () => {
  const c = findWalkOnlyRoute(NEAR)![0];
  const dest = { x: NEAR.ex, y: NEAR.ey };

  it('길 고르기: "걷기" 길 하나, 어르신 걸음으로 늘린 시간', () => {
    expect(routeKindLabel(c)).toBe('걷기');
    const cls = classifyRoutes([c])!;
    expect(cls.kind).toBe('SINGLE');
    if (cls.kind !== 'SINGLE') return;
    expect(cls.best.adjustedTotalMin).toBeCloseTo(c.totalTimeMin * 1.45, 5);
  });

  it('안내 카드: 목적지까지 걷는 카드 하나, 나침반 목표는 목적지, 출구 안내 없음', () => {
    const legs = buildRouteLegs(c, { destName: '동네 약국', destCoord: dest });
    expect(legs).toHaveLength(1);
    expect(legs.some(isRideLeg)).toBe(false);
    const w = legs[0] as WalkLeg;
    expect(w.walkKind).toBe('EXIT');
    expect(w.toName).toBe('동네 약국');
    expect(w.target).toEqual({ name: '동네 약국', lat: dest.y, lng: dest.x });
    const vm = walkVM(w);
    expect(vm.title).toBe('동네 약국까지 걸어가요');
    expect(vm.speech).not.toContain('출구');
    expect(vm.speech).toContain(`약 ${c.walkDistanceM}m`);
  });

  it('걷기를 마치면 도착으로 끝난다', () => {
    const legs = buildRouteLegs(c, { destName: '동네 약국', destCoord: dest });
    const start = createMultiLegState({ routeId: 'w', destName: '동네 약국', legs, now: 0 });
    const end = multiLegReducer(start.state, { type: 'WALK_DONE', now: 1000 });
    expect(end.state.finished).toBe(true);
    expect(end.effects.some((e) => e.kind === 'SPEAK' && e.key === 'w:ARRIVED')).toBe(true);
  });

  it('탈것에서 내린 뒤 걷는 길은 지금처럼 출구 안내를 한다', () => {
    const odsay = routesFromBody(sample)[0];
    const legs = buildRouteLegs(odsay, { destName: '서울대병원' });
    const exit = legs[legs.length - 1] as WalkLeg;
    expect(exit.walkKind).toBe('EXIT');
    expect(walkVM(exit).speech).toContain('출구');
  });
});
