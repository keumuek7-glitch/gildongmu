/**
 * 두 휴대폰(어르신·가족) 연결: Firebase Realtime Database 중계의 순수 로직.
 * 기존 길동무(legacy/app.js)의 Relay·Link와 같은 규칙과 같은 저장 키를 써서,
 * 이미 연결해 둔 휴대폰은 새 앱으로 바뀌어도 그대로 이어집니다.
 *
 *  - 두 휴대폰이 같은 '방'(긴 무작위 이름)을 공유합니다. 방 이름을 아는 휴대폰만 읽고 씁니다.
 *  - 메시지 종류마다 마지막 것 하나만 둡니다: rooms/<방>/<종류>.json
 *  - 받는 쪽 앱이 열려 있을 때만 바로 뜹니다(닫혀 있으면 다음에 열 때 받음).
 */

/** 저장·전송에 쓰는 역할 값. 가족은 기존 앱과 맞추려고 'child'로 둡니다. */
export type Role = 'elder' | 'child';

export const DB_DEFAULT = 'https://gildongmu-1df21-default-rtdb.asia-southeast1.firebasedatabase.app';

/** 메시지 종류 (기존 앱과 같음) */
export type RelayType = 'trip' | 'tripReset' | 'guide' | 'viewed' | 'elderLoc' | 'arrived' | 'alighted';

export interface RelayMessage<T = unknown> {
  type: string;
  data: T;
  /** 보낸 시각(ms) */
  t: number;
  /** 보낸 쪽 역할 */
  from: string;
}

export interface LatLngPlace {
  name: string;
  lat: number;
  lng: number;
}

/** 가족이 보내는 길 정보 (기존 앱의 trip 메시지) */
export interface TripData {
  from: LatLngPlace | null;
  stop: LatLngPlace | null;
  dest: LatLngPlace | null;
  sample?: boolean;
}

/** 오래된 알림은 다시 띄우지 않는 종류 */
export const TRANSIENT_TYPES: ReadonlySet<string> = new Set(['viewed', 'arrived', 'alighted']);
export const TRANSIENT_MAX_AGE_MS = 10 * 60 * 1000;

const ROOM_RE = /^[A-Za-z0-9_-]{20,40}$/;

export function isValidRoomId(room: string | null | undefined): room is string {
  return typeof room === 'string' && ROOM_RE.test(room);
}

/** 16바이트 무작위 → base64url (22자). randomBytes는 시험용으로 바꿔 넣을 수 있습니다. */
export function newRoomId(randomBytes: (n: number) => Uint8Array = defaultRandomBytes): string {
  const b = randomBytes(16);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function defaultRandomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** 주소의 role 값. 'family'도 가족으로 받아 줍니다. */
export function parseRole(v: string | null | undefined): Role | null {
  if (v === 'elder') return 'elder';
  if (v === 'child' || v === 'family') return 'child';
  return null;
}

/** 연결 링크(?role=elder&pair=방이름) 읽기 */
export function parsePairLink(search: string): { room: string; role: Role | null } | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const room = p.get('pair');
  if (!isValidRoomId(room)) return null;
  return { room, role: parseRole(p.get('role')) };
}

/** 가족이 어르신에게 보내는 연결 링크 */
export function buildPairLink(appUrl: string, room: string, role: Role = 'elder'): string {
  const u = new URL(appUrl);
  u.search = '';
  u.hash = '';
  u.searchParams.set('role', role);
  u.searchParams.set('pair', room);
  return u.toString();
}

export function normalizeDbUrl(db: string): string {
  return db.trim().replace(/\/+$/, '');
}

/** rooms/<방>[/<종류>].json 주소 */
export function roomUrl(db: string, room: string, type?: string): string {
  return `${normalizeDbUrl(db)}/rooms/${room}${type ? '/' + type : ''}.json`;
}

export type AcceptResult = 'deliver' | 'store-only' | 'ignore';

/**
 * 받은 메시지를 화면에 띄울지 정합니다.
 *  - 내가 보낸 것, 이미 본 것(seenT 이하)은 무시
 *  - 알림성 메시지가 10분보다 오래됐으면 기록만
 */
export function acceptMessage(m: unknown, myRole: Role | null, seenT: number, now: number): AcceptResult {
  if (!isRelayMessage(m)) return 'ignore';
  if (myRole && m.from === myRole) return 'ignore';
  if (m.t <= seenT) return 'ignore';
  if (TRANSIENT_TYPES.has(m.type) && now - m.t > TRANSIENT_MAX_AGE_MS) return 'store-only';
  return 'deliver';
}

export function isRelayMessage(m: unknown): m is RelayMessage {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return typeof o.type === 'string' && o.type.length > 0 && typeof o.t === 'number' && o.t > 0;
}

/**
 * Firebase 스트리밍(EventSource)의 put/patch 이벤트 하나를 메시지 목록으로 바꿉니다.
 *  - path "/" : 방 전체 → 종류별 메시지 여러 개
 *  - path "/<종류>" + put : 메시지 하나
 */
export function parseStreamEvent(eventType: string, raw: string): RelayMessage[] {
  let d: { path?: unknown; data?: unknown };
  try {
    d = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!d || typeof d !== 'object') return [];
  const parts = String(d.path ?? '/').split('/').filter(Boolean);
  if (parts.length === 0) {
    if (!d.data || typeof d.data !== 'object') return [];
    return Object.values(d.data as Record<string, unknown>).filter(isRelayMessage);
  }
  if (parts.length === 1 && eventType === 'put' && isRelayMessage(d.data)) return [d.data];
  return [];
}

/* ── 길 정보 ↔ 경로 탐색 좌표 ─────────────────────────────── */

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 받은 trip 데이터를 검사해 정리합니다. 이상한 칸은 null. */
export function sanitizeTrip(d: unknown): TripData | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const place = (p: unknown): LatLngPlace | null => {
    if (!p || typeof p !== 'object') return null;
    const q = p as Record<string, unknown>;
    const lat = Number(q.lat);
    const lng = Number(q.lng);
    if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { name: String(q.name ?? '').slice(0, 30), lat, lng };
  };
  return { from: place(o.from), stop: place(o.stop), dest: place(o.dest), sample: o.sample === true || undefined };
}

/**
 * 가족이 보낸 도착지를 경로 탐색용 목적지로 바꿉니다.
 * 카카오·길동무는 (위도 lat, 경도 lng), ODsay는 x=경도·y=위도입니다. 바꾸는 곳은 여기 한 군데.
 */
export function tripDestToRouteDest(trip: TripData | null): { name: string; x: number; y: number } | null {
  const d = trip?.dest;
  if (!d) return null;
  return { name: d.name || '가족이 보낸 곳', x: d.lng, y: d.lat };
}
