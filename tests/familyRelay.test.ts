import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptMessage,
  buildPairLink,
  isValidRoomId,
  newRoomId,
  parsePairLink,
  parseRole,
  parseStreamEvent,
  roomUrl,
  sanitizeTrip,
  tripDestToRouteDest,
  TRANSIENT_MAX_AGE_MS,
} from '../src/core/guardian/familyRelay';
import { FamilyRelayClient } from '../src/services/familyRelayClient';

const ROOM = 'abcdefghijklmnopqrstuv'; // 22자
const NOW = 1_700_000_000_000;

describe('연결 방 이름·링크', () => {
  it('새 방 이름은 22자 base64url이고 검사를 통과한다', () => {
    const r = newRoomId(() => new Uint8Array(16).fill(255));
    expect(r).toHaveLength(22);
    expect(r).not.toMatch(/[+/=]/);
    expect(isValidRoomId(r)).toBe(true);
  });

  it('짧거나 이상한 방 이름은 거절한다', () => {
    expect(isValidRoomId('short')).toBe(false);
    expect(isValidRoomId('abc/../../etc/passwd_xxxxxxxxx')).toBe(false);
    expect(isValidRoomId(null)).toBe(false);
  });

  it('연결 링크를 만들고 다시 읽는다 (기존 주소의 다른 파라미터는 버림)', () => {
    const link = buildPairLink('https://keumuek7-glitch.github.io/gildongmu/?role=child&x=1#a', ROOM);
    expect(link).toBe(`https://keumuek7-glitch.github.io/gildongmu/?role=elder&pair=${ROOM}`);
    expect(parsePairLink(new URL(link).search)).toEqual({ room: ROOM, role: 'elder' });
  });

  it('기존 앱의 role=child 링크와 family 둘 다 가족으로 읽는다', () => {
    expect(parseRole('child')).toBe('child');
    expect(parseRole('family')).toBe('child');
    expect(parseRole('admin')).toBeNull();
  });

  it('데이터베이스 주소 끝의 / 를 정리한다', () => {
    expect(roomUrl('https://db.example.app///', ROOM, 'trip')).toBe(`https://db.example.app/rooms/${ROOM}/trip.json`);
    expect(roomUrl('https://db.example.app', ROOM)).toBe(`https://db.example.app/rooms/${ROOM}.json`);
  });
});

describe('받은 메시지 거르기', () => {
  const msg = (o: Partial<{ type: string; t: number; from: string }>) => ({ type: 'trip', data: {}, t: NOW, from: 'child', ...o });

  it('상대가 보낸 새 메시지는 띄운다', () => {
    expect(acceptMessage(msg({}), 'elder', 0, NOW)).toBe('deliver');
  });
  it('내가 보낸 것과 이미 본 것은 무시한다', () => {
    expect(acceptMessage(msg({ from: 'elder' }), 'elder', 0, NOW)).toBe('ignore');
    expect(acceptMessage(msg({}), 'elder', NOW, NOW)).toBe('ignore');
  });
  it('10분 넘은 알림(도착 등)은 기록만 하고, 길 정보는 오래돼도 띄운다', () => {
    const old = NOW - TRANSIENT_MAX_AGE_MS - 1;
    expect(acceptMessage(msg({ type: 'arrived', t: old, from: 'elder' }), 'child', 0, NOW)).toBe('store-only');
    expect(acceptMessage(msg({ type: 'trip', t: old }), 'elder', 0, NOW)).toBe('deliver');
  });
  it('모양이 틀린 것은 무시한다', () => {
    expect(acceptMessage({ type: 'trip' }, 'elder', 0, NOW)).toBe('ignore');
    expect(acceptMessage(null, 'elder', 0, NOW)).toBe('ignore');
  });
});

describe('Firebase 스트리밍 이벤트 읽기', () => {
  const m1 = { type: 'trip', data: {}, t: 1, from: 'child' };
  const m2 = { type: 'viewed', data: {}, t: 2, from: 'child' };
  it('처음 받는 방 전체(path /)는 종류별로 나눈다', () => {
    expect(parseStreamEvent('put', JSON.stringify({ path: '/', data: { trip: m1, viewed: m2 } }))).toEqual([m1, m2]);
  });
  it('한 종류 put은 하나, 깊은 경로나 빈 값은 무시', () => {
    expect(parseStreamEvent('put', JSON.stringify({ path: '/trip', data: m1 }))).toEqual([m1]);
    expect(parseStreamEvent('put', JSON.stringify({ path: '/trip/data', data: 1 }))).toEqual([]);
    expect(parseStreamEvent('put', JSON.stringify({ path: '/', data: null }))).toEqual([]);
    expect(parseStreamEvent('put', 'not json')).toEqual([]);
  });
});

describe('가족이 보낸 길 → 경로 탐색 목적지', () => {
  it('위도·경도를 ODsay x=경도, y=위도로 바꾼다', () => {
    const trip = sanitizeTrip({ dest: { name: '서울대학교병원', lat: 37.5797, lng: 126.999 } });
    expect(tripDestToRouteDest(trip)).toEqual({ name: '서울대학교병원', x: 126.999, y: 37.5797 });
  });
  it('좌표가 이상하면 버린다', () => {
    expect(sanitizeTrip({ dest: { name: 'x', lat: 'abc', lng: 1 } })?.dest).toBeNull();
    expect(sanitizeTrip({ dest: { name: 'x', lat: 200, lng: 1 } })?.dest).toBeNull();
    expect(tripDestToRouteDest(sanitizeTrip({}))).toBeNull();
  });
});

describe('FamilyRelayClient', () => {
  let mem: Map<string, string>;
  beforeEach(() => {
    mem = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
  });

  function fakeEs() {
    const handlers: Record<string, (e: MessageEvent) => void> = {};
    const es = {
      readyState: 1,
      onopen: null,
      onerror: null,
      addEventListener: (t: string, f: (e: MessageEvent) => void) => { handlers[t] = f; },
      close: vi.fn(),
      emit: (t: string, data: unknown) => handlers[t]?.({ data: JSON.stringify(data) } as MessageEvent),
    };
    return es;
  }

  it('연결 안 됐으면 보내기는 저장만 하고 서버에 보내지 않는다', () => {
    const fetchImpl = vi.fn();
    const c = new FamilyRelayClient('child', { fetchImpl, now: () => NOW });
    c.send('trip', { dest: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(c.last('trip')?.from).toBe('child');
  });

  it('기존 길동무의 저장 키(gd_room)를 그대로 읽고, 방 주소로 PUT 한다', () => {
    mem.set('gd_room', JSON.stringify(ROOM));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const c = new FamilyRelayClient('elder', { fetchImpl, now: () => NOW });
    expect(c.isPaired()).toBe(true);
    c.send('arrived', { name: '병원' });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/rooms/${ROOM}/arrived\\.json$`)),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('받은 메시지는 한 번만 전달하고 상태를 on으로 바꾼다', () => {
    mem.set('gd_room', JSON.stringify(ROOM));
    const es = fakeEs();
    const c = new FamilyRelayClient('elder', { createEventSource: () => es, fetchImpl: vi.fn(), now: () => NOW });
    const got: string[] = [];
    c.onMessage((m) => got.push(m.type));
    c.start();
    expect(c.getState()).toBe('connecting');
    const m = { type: 'trip', data: { dest: { name: 'a', lat: 37.5, lng: 127 } }, t: NOW - 5, from: 'child' };
    es.emit('put', { path: '/', data: { trip: m } });
    es.emit('put', { path: '/trip', data: m }); // 같은 것 또 옴
    expect(got).toEqual(['trip']);
    expect(c.getState()).toBe('on');
    c.leave();
    expect(es.close).toHaveBeenCalled();
    expect(c.isPaired()).toBe(false);
  });

  it('ensureRoom은 방이 없을 때만 새로 만든다', () => {
    const c = new FamilyRelayClient('child', { createEventSource: () => fakeEs(), fetchImpl: vi.fn() });
    const r1 = c.ensureRoom();
    expect(isValidRoomId(r1)).toBe(true);
    expect(c.ensureRoom()).toBe(r1);
  });
});
