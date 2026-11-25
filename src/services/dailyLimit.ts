import type { KeyValueStore } from './routeCache';

/**
 * 하루 길 찾기 상한(이 폰에서 바깥 서비스를 새로 부르는 횟수). 저장해 둔 길을 꺼내 쓰는 것은 세지 않습니다.
 * 날짜는 폰의 현재 날짜 기준이라 자정이 지나면 다시 채워집니다.
 * 30은 처음 정한 값입니다. ODsay의 실제 한도와 이 폰의 사용량을 본 뒤에 조절합니다.
 */
export const DAILY_ROUTE_LIMIT = 30;

const KEY = 'routeDaily';

interface Daily { day: string; count: number }

export class DailyLimit {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
    readonly limit = DAILY_ROUTE_LIMIT,
  ) {}

  private today(): string {
    const d = new Date(this.now());
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  used(): number {
    const s = this.store.get<Partial<Daily>>(KEY, {});
    return s.day === this.today() ? Number(s.count) || 0 : 0;
  }

  remaining(): number {
    return Math.max(0, this.limit - this.used());
  }

  /** 바깥 서비스를 부르기 직전에 한 번 셉니다(실패해도 센 것으로 둡니다). */
  record(): void {
    this.store.set(KEY, { day: this.today(), count: this.used() + 1 });
  }

  reset(): void {
    this.store.del(KEY);
  }
}
