/**
 * 나침반 안내 계산 (기존 길동무 legacy/app.js 의 거리·방위·나침반 규칙을 옮김).
 *  - 목적지가 늘 위, 내가 아래. 방향이 맞으면(±20°) "이쪽이에요"
 *  - 직선 방향이라 실제 걷는 길과 다를 수 있습니다.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export const EARTH_M = 6371000;
export const ALIGN_DEG = 20;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const norm180 = (a: number) => ((((a % 360) + 540) % 360) - 180);
export const norm360 = (a: number) => (((a % 360) + 360) % 360);

/** 두 점 사이 거리(m, 하버사인) */
export function distM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** a에서 b를 보는 방위(북=0, 동=90) */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}

/** 100m 단위 아래는 10m로 반올림, 1km 넘으면 0.1km */
export function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`;
}

export type CompassStatus = 'NO_POSITION' | 'NO_HEADING' | 'ALIGNED' | 'TURN_RIGHT' | 'TURN_LEFT' | 'ARRIVED';

export interface CompassGuide {
  status: CompassStatus;
  /** 큰 글씨 문구 */
  text: string;
  /** 화살표를 돌릴 각도(도). 0이면 화면 위쪽(목적지) */
  arrowRotate: number;
  /** 목적지 방위 (화면 위 = 이 방위). 동서남북 글자를 놓는 데 씀 */
  targetBearing: number | null;
  distanceM: number | null;
}

/** 이 거리 안이면 도착으로 봄 (기존 길동무와 같음) */
export const ARRIVE_M = 30;

/**
 * 지금 위치·휴대폰 방향으로 나침반 안내를 만듭니다.
 * heading: 휴대폰 윗부분이 가리키는 방위(북=0). 모르면 null.
 */
export function compassGuide(pos: LatLng | null, heading: number | null, target: LatLng): CompassGuide {
  if (!pos) return { status: 'NO_POSITION', text: '내 위치를 찾는 중', arrowRotate: 0, targetBearing: null, distanceM: null };
  const d = distM(pos, target);
  const b = bearingDeg(pos, target);
  if (d <= ARRIVE_M) return { status: 'ARRIVED', text: '거의 다 왔어요', arrowRotate: 0, targetBearing: b, distanceM: d };
  if (heading == null) return { status: 'NO_HEADING', text: '방향을 찾는 중', arrowRotate: 0, targetBearing: b, distanceM: d };
  const r = norm180(b - heading); // +면 목적지가 오른쪽
  const aligned = Math.abs(r) <= ALIGN_DEG;
  return {
    status: aligned ? 'ALIGNED' : r > 0 ? 'TURN_RIGHT' : 'TURN_LEFT',
    text: aligned ? '이쪽이에요' : r > 0 ? '오른쪽으로 돌아요' : '왼쪽으로 돌아요',
    // 화면은 목적지가 늘 위. 화살표(내가 향한 쪽)는 목적지 기준 -r 만큼 돌아감
    arrowRotate: -r,
    targetBearing: b,
    distanceM: d,
  };
}

/** 나침반 센서 값 부드럽게 하기 (기존과 같은 0.8/0.2 지수평활, 359°↔1° 경계 안전) */
export function smoothHeading(prev: { s: number; c: number } | null, h: number, k = 0.2): { s: number; c: number; heading: number } {
  const s = Math.sin(rad(h));
  const c = Math.cos(rad(h));
  const ns = prev ? prev.s * (1 - k) + s * k : s;
  const nc = prev ? prev.c * (1 - k) + c * k : c;
  return { s: ns, c: nc, heading: norm360(deg(Math.atan2(ns, nc))) };
}

/** DeviceOrientationEvent → 방위. iOS는 webkitCompassHeading, 안드로이드는 absolute alpha */
export function headingFromOrientation(
  e: { webkitCompassHeading?: number; absolute?: boolean; alpha?: number | null },
  screenAngle = 0,
): number | null {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return null;
  return norm360(h + screenAngle);
}

/** 화면 위가 upBearing일 때 동서남북 글자 자리 (cx,cy 중심, r 반지름) */
export function nsewPositions(cx: number, cy: number, r: number, upBearing: number) {
  return ([['북', 0], ['동', 90], ['남', 180], ['서', 270]] as const).map(([name, d]) => {
    const a = rad(d - upBearing);
    return { name, x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  });
}

/**
 * 바늘이 한 바퀴 넘어갈 때(359°→1°) 거꾸로 한 바퀴 도는 것을 막기 위해,
 * 이전에 그린 각도(prev)에서 가장 가까운 쪽으로 이어 붙인 각도를 돌려줍니다.
 */
export function unwrapAngle(prev: number, next: number): number {
  return prev + norm180(next - prev);
}
