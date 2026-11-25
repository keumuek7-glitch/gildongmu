import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  buildSubwayGraph,
  findSuspectCoords,
  formatGraph,
  type RawFiles,
} from '../scripts/buildSubwayGraph';
import graphJson from '../src/data/subwayGraph.json';
import type { SubwayGraph } from '../src/core/subwayGraphTypes';
import type { RouteCandidate } from '../src/core/types';
import { createSubwayRouter, metersBetween, SUBWAY_TUNING } from '../src/services/subwayRouter';

const RAW_DIR = path.resolve(__dirname, '..', 'data', 'raw', 'seoul-metro');
function pick(prefix: string): string {
  const hits = readdirSync(RAW_DIR).filter((n) => n.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`'${prefix}' 파일은 하나만 있어야 해요: ${hits.join(', ')}`);
  return readFileSync(path.join(RAW_DIR, hits[0]), 'utf-8');
}
const RAW: RawFiles = { gaps: pick('역간거리'), transfers: pick('환승역거리'), coords: pick('1_8호선_역사_좌표') };

const graph = graphJson as unknown as SubwayGraph;
const router = createSubwayRouter(graph);
const station = (id: string) => {
  const s = graph.stations.find((t) => t[0] === id);
  if (!s || s[3] === null || s[4] === null) throw new Error(`좌표 없는 역: ${id}`);
  return { x: s[3] + 0.0005, y: s[4] + 0.0005 }; // 역에서 몇십 m 떨어진 곳
};
const trip = (from: string, to: string) => {
  const a = station(from);
  const b = station(to);
  return router.findRoutes({ sx: a.x, sy: a.y, ex: b.x, ey: b.y });
};
const rides = (r: RouteCandidate) => r.segments.filter((s) => s.mode === 'SUBWAY');

describe('지하철 지도 만들기 (scripts/buildSubwayGraph.ts)', () => {
  it('저장소에 올려 둔 지도는 올려 둔 원본 자료로 만든 것과 같다 (자료만 바꾸고 지도를 안 만든 실수를 막음)', () => {
    expect(formatGraph(buildSubwayGraph(RAW))).toBe(readFileSync(path.resolve(__dirname, '..', 'src/data/subwayGraph.json'), 'utf-8'));
  });

  it('이름이 다른 역은 한 이름으로 맞춰진다 (서울/서울역, 신내/신내역, 이수/총신대입구, 자양/뚝섬유원지)', () => {
    const ids = new Set(graph.stations.map((s) => s[0]));
    for (const id of ['1|서울역', '4|서울역', '6|신내', '7|총신대입구', '4|총신대입구', '7|뚝섬유원지', '4|미아사거리']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(ids.has('1|서울')).toBe(false);
    expect(ids.has('4|미아사거리 ')).toBe(false);
    // 7호선 총신대입구와 4호선 총신대입구는 갈아탈 수 있다
    expect(graph.transfers.some((t) => [t[0], t[1]].sort().join() === ['4|총신대입구', '7|총신대입구'].sort().join())).toBe(true);
  });

  it('좌표가 어긋난 역은 좌표를 쓰지 않고, 이유를 지도에 적어 둔다', () => {
    expect(graph.meta.unusedCoords).toEqual(['2|신답', '2|용답', '2|잠실새내', '2|종합운동장', '5|발산']);
    for (const id of graph.meta.unusedCoords) {
      const s = graph.stations.find((t) => t[0] === id)!;
      expect(s[3]).toBeNull();
      expect(s[4]).toBeNull();
    }
    // 좌표가 남은 모든 역은 옆 역과 거리가 자료와 크게 어긋나지 않는다
    const pos = new Map(graph.stations.filter((s) => s[3] !== null).map((s) => [s[0], s] as const));
    for (const [a, b, , meters] of graph.rides) {
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb) continue;
      const ratio = metersBetween(pa[3]!, pa[4]!, pb[3]!, pb[4]!) / meters;
      expect(ratio, `${a}-${b}`).toBeLessThan(1.5);
      expect(ratio, `${a}-${b}`).toBeGreaterThan(0.4);
    }
  });

  it('틀린 좌표 찾기: 두 줄에 걸린 역은 그 역만, 한 줄만 걸리면 양쪽 모두 뺀다', () => {
    const st = (id: string, x: number, y: number) => [id, 2, id, x, y, null] as SubwayGraph['stations'][number];
    // A-B-C 가 약 1km 간격으로 곧게 놓여야 하는데 B 만 멀리 있음
    const stations = [st('A', 127.0, 37.5), st('B', 127.05, 37.55), st('C', 127.0, 37.5 + 0.018)];
    const rides: SubwayGraph['rides'] = [['A', 'B', 1000, 1000, 0, [0]], ['B', 'C', 1000, 1000, 0, [0]]];
    expect(findSuspectCoords(stations, rides)).toEqual(['B']);
    const one: SubwayGraph['rides'] = [['A', 'C', 1000, 100, 0, [0]]];
    expect(findSuspectCoords(stations, one)).toEqual(['A', 'C']);
  });

  it('갈래·순환: 2호선 두 지선, 5호선 마천 지선, 6호선 응암 순환이 자료의 환승 줄과 맞는다', () => {
    expect(graph.svcTransfers.map((t) => t[0]).sort()).toEqual(['2|성수', '2|신도림', '5|강동']);
    const one = graph.rides.filter((r) => r[4] === 1).map((r) => `${r[0]}>${r[1]}`);
    expect(one).toEqual(['6|응암>6|역촌', '6|역촌>6|불광', '6|불광>6|독바위', '6|독바위>6|연신내', '6|연신내>6|구산', '6|구산>6|응암']);
    // 둔촌동은 하남검단산이 아니라 강동에 이어진다
    expect(graph.rides.some((r) => r[0] === '5|강동' && r[1] === '5|둔촌동')).toBe(true);
    expect(graph.rides.some((r) => r[0] === '5|하남검단산' && r[1] === '5|둔촌동')).toBe(false);
  });

  it('자료가 바뀌어 맞지 않으면 조용히 틀린 지도를 만들지 않고 이유를 적어 멈춘다', () => {
    // 좌표 파일에서 한 역을 빼면
    const noCoord = RAW.coords.split('\n').filter((l) => !l.includes(',강남,')).join('\n');
    expect(() => buildSubwayGraph({ ...RAW, coords: noCoord })).toThrow(/좌표를 못 찾은 역/);
    // 시간 파일에 없는 새 역이 좌표 파일에 생기면
    expect(() => buildSubwayGraph({ ...RAW, coords: RAW.coords.trimEnd() + '\n999,2,9999,새역,37.5,127.0,2026-01-01,2026-01-01\n' })).toThrow(/시간 파일에 없는 좌표 역/);
    // 칸 이름이 바뀌면
    expect(() => buildSubwayGraph({ ...RAW, gaps: RAW.gaps.replace('역간거리(km)', '거리') })).toThrow(/칸이 없어요/);
    // 갈래 환승 줄이 사라지면 (분기 설정과 자료가 달라짐)
    const noSelf = RAW.transfers.split('\n').filter((l) => !/^\d+,5,강동,5호선/.test(l)).join('\n');
    expect(() => buildSubwayGraph({ ...RAW, transfers: noSelf })).toThrow(/갈래\(지선\) 환승 역/);
    // 시간 값이 이상하면
    expect(() => buildSubwayGraph({ ...RAW, gaps: RAW.gaps.replace('02:00,1.1', '2분,1.1') })).toThrow(/시간/);
  });
});

describe('앱이 직접 계산하는 서울 지하철 길 (subwayRouter)', () => {
  it('한 번 갈아타는 길: 청량리 → 혜화는 1호선 뒤 동대문에서 4호선', () => {
    const routes = trip('1|청량리', '4|혜화')!;
    expect(routes).toHaveLength(1);
    const r = routes[0];
    expect(r.transferCount).toBe(1);
    expect(r.transferPoints).toEqual(['동대문']);
    const [a, b] = rides(r);
    expect([a.lineName, a.startName, a.endName, a.stationCount]).toEqual(['수도권 1호선', '청량리', '동대문', 4]);
    expect([b.lineName, b.startName, b.endName, b.stationCount]).toEqual(['수도권 4호선', '동대문', '혜화', 1]);
    expect(r.segments[0].mode).toBe('WALK');
    expect(r.segments[r.segments.length - 1].mode).toBe('WALK');
    expect(r.totalTimeMin).toBeGreaterThan(10);
    expect(r.totalTimeMin).toBeLessThan(40);
  });

  it('지나는 역 목록에 이름과 좌표가 들어 있어, 다음 역 확인과 걷기 안내에 그대로 쓸 수 있다', () => {
    const r = trip('1|청량리', '4|혜화')![0];
    const first = rides(r)[0];
    expect(first.stops!.map((s) => s.name)).toEqual(['청량리', '제기동', '신설동', '동묘앞', '동대문']);
    for (const s of first.stops!) {
      expect(typeof s.x).toBe('number');
      expect(typeof s.y).toBe('number');
    }
  });

  it('갈아타지 않는 길은 환승 0, 걷는 구간만 앞뒤에 붙는다', () => {
    const r = trip('2|강남', '2|시청')![0];
    expect(r.transferCount).toBe(0);
    expect(r.segments.map((s) => s.mode)).toEqual(['WALK', 'SUBWAY', 'WALK']);
  });

  it('2호선 신정지선은 같은 2호선이어도 신도림에서 갈아탄다 (대림 → 까치산)', () => {
    const r = trip('2|대림', '2|까치산')![0];
    expect(r.transferPoints).toEqual(['신도림']);
    expect(rides(r)).toHaveLength(2);
  });

  it('신도림에서 바로 타면 지선도 갈아타지 않는다 (신도림 → 까치산)', () => {
    expect(trip('2|신도림', '2|까치산')![0].transferCount).toBe(0);
  });

  it('5호선은 하남 쪽과 마천 쪽이 강동에서 갈라져서, 하남검단산 → 마천은 강동에서 갈아탄다', () => {
    const r = trip('5|하남검단산', '5|마천')![0];
    expect(r.transferPoints).toEqual(['강동']);
    // 방화 → 마천, 방화 → 하남검단산은 갈아타지 않는다 (강동까지 같은 길)
    expect(trip('5|방화', '5|마천')![0].transferCount).toBe(0);
    expect(trip('5|방화', '5|하남검단산')![0].transferCount).toBe(0);
  });

  it('6호선 응암 순환은 한 방향으로만 돈다 (새절 → 연신내는 응암에서 돌아 5정거장, 연신내 → 새절은 3정거장)', () => {
    const go = rides(trip('6|새절', '6|연신내')![0])[0];
    expect(go.stationCount).toBe(5);
    expect(go.stops!.map((s) => s.name)).toEqual(['새절', '응암', '역촌', '불광', '독바위', '연신내']);
    const back = rides(trip('6|연신내', '6|새절')![0])[0];
    expect(back.stops!.map((s) => s.name)).toEqual(['연신내', '구산', '응암', '새절']);
  });

  it('갈아타기 적은 길이 더 느리게 나오면 두 길을 모두 주고, 같으면 하나만 준다', () => {
    const many = trip('4|사당', '3|경찰병원')!;
    expect(many.length).toBeGreaterThanOrEqual(1);
    const sorted = [...many].sort((p, q) => p.totalTimeMin - q.totalTimeMin);
    expect(many.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    expect(new Set(many.map((r) => r.segments.map((s) => `${s.startName}>${s.endName}`).join('/'))).size).toBe(many.length);
  });

  it('이 지도에 없는 곳이거나 가까운 길이면 null (다른 길 찾기로 넘김)', () => {
    // 성남 판교 → 강남: 판교 가까이에는 이 지도의 역이 없음
    expect(router.findRoutes({ sx: 127.1112, sy: 37.3947, ex: 127.0276, ey: 37.4979 })).toBeNull();
    // 걸어도 되는 거리
    const a = station('1|청량리');
    expect(router.findRoutes({ sx: a.x, sy: a.y, ex: a.x + 0.004, ey: a.y })).toBeNull();
    // 좌표가 이상하면
    expect(router.findRoutes({ sx: NaN, sy: 37.5, ex: 127.0, ey: 37.5 })).toBeNull();
  });

  it('좌표를 믿을 수 없는 역(잠실새내 등)은 출발·도착 근처 역 후보로 고르지 않는다', () => {
    const near = router.nearbyStations(127.0862, 37.5116).map((s) => s.name);
    expect(near).not.toContain('잠실새내');
    expect(near).not.toContain('종합운동장');
  });

  it('후보 역은 800m 안, 이름 기준 4곳까지다', () => {
    const a = station('2|강남');
    const list = router.nearbyStations(a.x, a.y);
    expect(new Set(list.map((s) => s.name)).size).toBeLessThanOrEqual(SUBWAY_TUNING.nearestStations);
    for (const s of list) expect(s.meters).toBeLessThanOrEqual(SUBWAY_TUNING.maxStationWalkM);
  });
});
