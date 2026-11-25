import type { RouteCandidate } from '../core/types';
import type { Coords } from './routeApiClient';
import { metersBetween, SUBWAY_TUNING } from './subwayRouter';

/**
 * 가까운 곳은 앱이 직접 "걸어서 가는 길"을 만듭니다 (A-2 2단계).
 * 바깥 길 찾기(ODsay)는 너무 가까우면 길을 주지 않고, 지하철 계산도 1km 안쪽은 넘기므로
 * 그 빈자리를 여기서 채웁니다. 바깥 호출·저장·하루 횟수는 쓰지 않습니다.
 *
 * 아래 숫자는 가정입니다(실제 길을 따라 잰 거리가 아님).
 *  - 걷는 거리 = 직선거리 × 1.3 (지하철 계산과 같은 보정)
 *  - 보여 주는 시간은 지하철 계산과 같이 1분에 67m로 잡고, 화면에서 어르신 걸음(×1.45)으로 다시 늘립니다.
 *    그래서 어르신 기준으로는 1초에 약 0.77m 걷는 셈입니다.
 */
export const WALK_TUNING = {
  /** 출발-도착 직선거리가 이보다 짧으면 걷는 길만 보여 줌 (지하철 계산이 넘기는 거리와 같음) */
  maxStraightM: SUBWAY_TUNING.minTripStraightM,
  detourFactor: SUBWAY_TUNING.detourFactor,
  shownWalkMPerMin: SUBWAY_TUNING.shownWalkMPerMin,
} as const;

export function findWalkOnlyRoute(c: Coords): RouteCandidate[] | null {
  if (![c.sx, c.sy, c.ex, c.ey].every((v) => Number.isFinite(v))) return null;
  const straight = metersBetween(c.sx, c.sy, c.ex, c.ey);
  if (straight >= WALK_TUNING.maxStraightM) return null;
  const meters = Math.max(10, Math.round((straight * WALK_TUNING.detourFactor) / 10) * 10);
  const minutes = Math.max(1, Math.ceil(meters / WALK_TUNING.shownWalkMPerMin));
  return [
    {
      id: 'walk-0',
      totalTimeMin: minutes,
      walkTimeMin: minutes,
      walkDistanceM: meters,
      transferCount: 0,
      segments: [{ mode: 'WALK', durationMin: minutes, distanceM: meters }],
      transferPoints: [],
    },
  ];
}
