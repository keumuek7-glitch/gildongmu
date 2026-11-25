/**
 * 가족 화면 약도 계산 (기존 길동무 drawChildMap을 옮김).
 * 목적지 방향이 늘 위가 되도록 돌린 약도: 어르신은 아래 가운데, 목적지는 위.
 */
import { bearingDeg, distM, norm180, type LatLng } from '../navigation/compass';

const EARTH = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** 미터, x=동쪽, y=북쪽 */
export function toXY(o: LatLng, p: LatLng): { x: number; y: number } {
  return { x: rad(p.lng - o.lng) * EARTH * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * EARTH };
}

export interface FamilyMapLayout {
  W: number;
  H: number;
  elder: { x: number; y: number };
  dest: { x: number; y: number } | null;
  /** 내릴 곳 (화면 안일 때만) */
  stop: { x: number; y: number } | null;
  distanceM: number | null;
  /** 북쪽 화살표 각도(화면 위=0) */
  northRotate: number;
  /** 어르신이 보는 쪽(옅은 부채꼴) 회전, 방향을 모르면 null */
  headingRotate: number | null;
}

export function layoutFamilyMap(
  elder: LatLng & { heading?: number | null },
  dest: LatLng | null,
  stop: LatLng | null = null,
  W = 350,
  H = 300,
): FamilyMapLayout {
  const ex = W / 2;
  if (!dest) {
    return { W, H, elder: { x: ex, y: H / 2 }, dest: null, stop: null, distanceM: null, northRotate: 0, headingRotate: elder.heading ?? null };
  }
  const ey = H - 52;
  const top = 46;
  const b = bearingDeg(elder, dest);
  const d = distM(elder, dest);
  const scale = (ey - top) / Math.max(d, 1);
  const s = Math.sin(rad(b));
  const c = Math.cos(rad(b));
  const proj = (p: LatLng) => {
    const v = toXY(elder, p);
    const up = v.x * s + v.y * c;
    const right = v.x * c - v.y * s;
    return { x: ex + right * scale, y: ey - up * scale };
  };
  let st: { x: number; y: number } | null = null;
  if (stop) {
    const sp = proj(stop);
    if (sp.y > 10 && sp.y < H - 10 && sp.x > 10 && sp.x < W - 10) st = sp;
  }
  return {
    W,
    H,
    elder: { x: ex, y: ey },
    dest: { x: ex, y: top },
    stop: st,
    distanceM: d,
    northRotate: -b,
    headingRotate: elder.heading == null ? null : norm180(elder.heading - b),
  };
}

/** 8방향 이름 */
export const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const;
export const dirName = (deg: number) => DIR8[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** 가족이 고를 수 있는 한 마디 (기존 길동무와 같음) */
export const PHRASES = ['곧장 가요', '길 건너요', '왼쪽으로', '오른쪽으로'] as const;
export const PHRASE_MAX = 12;
