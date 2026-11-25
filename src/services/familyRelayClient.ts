import {
  DB_DEFAULT,
  acceptMessage,
  newRoomId,
  normalizeDbUrl,
  parseStreamEvent,
  roomUrl,
  type RelayMessage,
  type Role,
} from '../core/guardian/familyRelay';

/**
 * 기존 길동무와 같은 localStorage 키(gd_ 접두어, JSON 값)를 씁니다.
 * 같은 주소(GitHub Pages)에서 열리므로 이미 연결된 방·역할이 그대로 이어집니다.
 */
export const gdStore = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('gd_' + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try { localStorage.setItem('gd_' + k, JSON.stringify(v)); } catch { /* noop */ }
  },
  del(k: string): void {
    try { localStorage.removeItem('gd_' + k); } catch { /* noop */ }
  },
};

export type RelayState = 'off' | 'connecting' | 'on' | 'error';

type EventSourceLike = {
  readyState: number;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener(type: string, fn: (e: MessageEvent) => void): void;
  close(): void;
};

export interface RelayDeps {
  fetchImpl?: typeof fetch;
  createEventSource?: (url: string) => EventSourceLike;
  now?: () => number;
}

export class FamilyRelayClient {
  private es: EventSourceLike | null = null;
  private state: RelayState = 'off';
  private stateListeners: Array<(s: RelayState) => void> = [];
  private msgListeners: Array<(m: RelayMessage) => void> = [];
  private readonly fetchImpl: typeof fetch;
  private readonly createEs: ((url: string) => EventSourceLike) | null;
  private readonly now: () => number;

  constructor(private role: Role | null, deps: RelayDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? ((...a) => fetch(...a));
    this.createEs =
      deps.createEventSource ??
      (typeof EventSource !== 'undefined' ? (u: string) => new EventSource(u) as unknown as EventSourceLike : null);
    this.now = deps.now ?? Date.now;
  }

  db(): string { return normalizeDbUrl(gdStore.get('dbUrl', '') || DB_DEFAULT); }
  room(): string { return gdStore.get('room', ''); }
  isPaired(): boolean { return !!(this.db() && this.room()); }
  getState(): RelayState { return this.state; }
  setRole(r: Role | null): void { this.role = r; }

  onState(f: (s: RelayState) => void): () => void {
    this.stateListeners.push(f);
    return () => { this.stateListeners = this.stateListeners.filter((x) => x !== f); };
  }
  onMessage(f: (m: RelayMessage) => void): () => void {
    this.msgListeners.push(f);
    return () => { this.msgListeners = this.msgListeners.filter((x) => x !== f); };
  }

  /** 마지막으로 받은(또는 보낸) 메시지 */
  last<T = unknown>(type: string): RelayMessage<T> | null { return gdStore.get('last_' + type, null); }

  send(type: string, data: unknown): RelayMessage {
    const m: RelayMessage = { type, data, t: this.now(), from: this.role ?? '' };
    gdStore.set('last_' + type, m);
    gdStore.set('seen_' + type, m.t);
    if (this.isPaired()) {
      this.fetchImpl(roomUrl(this.db(), this.room(), type), { method: 'PUT', body: JSON.stringify(m) })
        .then((r) => { if (!r.ok) this.setState('error'); })
        .catch(() => this.setState('error'));
    }
    return m;
  }

  start(): void {
    this.stop();
    if (!this.isPaired() || !this.createEs) return;
    this.setState('connecting');
    const es = this.createEs(roomUrl(this.db(), this.room()));
    this.es = es;
    const onData = (type: string) => (e: MessageEvent) => {
      this.setState('on');
      for (const m of parseStreamEvent(type, String(e.data))) this.take(m);
    };
    es.onopen = () => this.setState('on');
    es.addEventListener('put', onData('put'));
    es.addEventListener('patch', onData('patch'));
    es.addEventListener('cancel', () => this.setState('error')); // 데이터베이스 규칙에서 막힘
    es.onerror = () => this.setState(this.es && this.es.readyState === 2 ? 'error' : 'connecting');
  }

  stop(): void {
    if (this.es) {
      try { this.es.close(); } catch { /* noop */ }
      this.es = null;
    }
    this.setState('off');
  }

  join(room: string): void {
    gdStore.set('room', room);
    this.start();
  }

  /** 방이 없으면 새로 만들어 들어갑니다. 방 이름을 돌려줍니다. */
  ensureRoom(): string {
    const r = this.room() || newRoomId();
    if (r !== this.room()) this.join(r);
    else if (this.state === 'off') this.start();
    return r;
  }

  leave(): void {
    gdStore.del('room');
    this.stop();
  }

  private take(m: RelayMessage): void {
    const seen = gdStore.get<number>('seen_' + m.type, 0);
    const r = acceptMessage(m, this.role, seen, this.now());
    if (r === 'ignore') return;
    gdStore.set('seen_' + m.type, m.t);
    gdStore.set('last_' + m.type, m);
    if (r === 'deliver') this.msgListeners.forEach((f) => { try { f(m); } catch (e) { console.error(e); } });
  }

  private setState(s: RelayState): void {
    if (s === this.state) return;
    this.state = s;
    this.stateListeners.forEach((f) => { try { f(s); } catch { /* noop */ } });
  }
}
