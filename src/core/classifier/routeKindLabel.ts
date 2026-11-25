import type { RouteCandidate } from '../types';

/**
 * 길에서 쓰는 탈것을 처음 타는 순서대로 한 마디로 줄입니다.
 * 예: 전철만 → "전철", 버스만 → "버스", 버스 타고 전철 → "버스+전철".
 * 같은 탈것이 여러 번 나와도 한 번만 적습니다(전철→버스→전철 이면 "전철+버스").
 * 탈것 없이 걷기만 하면 "걷기".
 */
export function routeKindLabel(c: Pick<RouteCandidate, 'segments'>): string {
  const names: string[] = [];
  for (const s of c.segments) {
    if (s.mode === 'WALK') continue;
    const n = s.mode === 'SUBWAY' ? '전철' : '버스';
    if (!names.includes(n)) names.push(n);
  }
  // 탈것 없이 걷기만 하는 길(가까운 곳)
  if (names.length === 0 && c.segments.some((s) => s.mode === 'WALK')) return '걷기';
  return names.join('+');
}
