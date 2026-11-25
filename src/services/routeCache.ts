import type { RouteCandidate } from '../core/types';
import type { Coords } from './routeApiClient';

/** gdStore(localStorage)와 같은 모양. 테스트에서는 메모리 저장소를 끼웁니다. */
export interface KeyValueStore {
  get<T>(k: string, d: T): T;
  set(k: string, v: unknown): void;
  del(k: string): void;
}

/**
 * 길 저장(캐시). 같은 출발·도착이면 바깥 서비스를 다시 부르지 않고 폰에 저장해 둔 길을 씁니다.
 * 길 후보(RouteCandidate)로 저장하므로 길 가져오는 곳이 ODsay에서 다른 것으로 바뀌어도 그대로 씁니다.
 * 처음 정한 값입니다. 실제로 얼마나 다시 쓰이는지(적중률)를 재 본 뒤에 조절합니다.
 */
export const ROUTE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const ROUTE_CACHE_MAX = 20;

interface Entry { key: string; at: number; routes: RouteCandidate[] }
export interface CacheStats { hit: number; miss: number }

const ENTRIES_KEY = 'routeCache';
const STATS_KEY = 'routeStats';

/** 소수점 4자리(약 10m)로 맞춘 출발→도착 키 */
export function coordKey(c: Coords): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(c.sx)},${r(c.sy)}>${r(c.ex)},${r(c.ey)}`;
}

export class RouteCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = ROUTE_CACHE_TTL_MS,
    private readonly maxEntries = ROUTE_CACHE_MAX,
  ) {}

  private load(): Entry[] {
    const list = this.store.get<Entry[]>(ENTRIES_KEY, []);
    return Array.isArray(list) ? list.filter((e) => e && typeof e.key === 'string' && Array.isArray(e.routes)) : [];
  }

  get(c: Coords): RouteCandidate[] | null {
    const key = coordKey(c);
    const e = this.load().find((x) => x.key === key);
    if (!e || this.now() - e.at > this.ttlMs) return null;
    return e.routes;
  }

  put(c: Coords, routes: RouteCandidate[]): void {
    const key = coordKey(c);
    const t = this.now();
    const kept = this.load().filter((e) => e.key !== key && t - e.at <= this.ttlMs);
    kept.push({ key, at: t, routes });
    // 오래된 것부터 버리고 최근 것만 maxEntries 개 남김
    this.store.set(ENTRIES_KEY, kept.slice(-this.maxEntries));
  }

  count(): number {
    const t = this.now();
    return this.load().filter((e) => t - e.at <= this.ttlMs).length;
  }

  clear(): void {
    this.store.del(ENTRIES_KEY);
  }

  stats(): CacheStats {
    const s = this.store.get<Partial<CacheStats>>(STATS_KEY, {});
    return { hit: Number(s.hit) || 0, miss: Number(s.miss) || 0 };
  }

  recordHit(): void {
    const s = this.stats();
    this.store.set(STATS_KEY, { ...s, hit: s.hit + 1 });
  }

  recordMiss(): void {
    const s = this.stats();
    this.store.set(STATS_KEY, { ...s, miss: s.miss + 1 });
  }

  resetStats(): void {
    this.store.del(STATS_KEY);
  }
}
