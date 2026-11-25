import type { RouteCandidate } from '../core/types';
import type { SubwayGraph, StationTuple } from '../core/subwayGraphTypes';
import { parseOdsayResponse } from '../core/parser/odsayRouteParser';

/**
 * 앱이 직접 계산하는 서울 지하철 길 (A안 1단계).
 * 서울교통공사 1~8호선 구간의 역 사이 시간·갈아타는 시간(공개 자료)만으로 길을 찾습니다.
 * 출발·도착 가까이에 이 지도의 역이 없거나(9호선·공항철도·신분당선·경의중앙선·버스가 필요한 길 등),
 * 가까운 거리면 null 을 돌려주고, 부르는 쪽이 다른 길 찾기(ODsay)로 넘어갑니다.
 *
 * 결과는 ODsay 응답과 같은 모양으로 만든 뒤 같은 변환기를 지나므로, 화면은 어느 쪽 길인지 가리지 않고 같게 동작합니다.
 * 아래 숫자들은 자료에 없어서 정한 값입니다(가정). 바꿔 보려면 SUBWAY_TUNING 만 고치면 됩니다.
 */
export const SUBWAY_TUNING = {
  /** 출발·도착에서 이 거리(직선 m) 안의 역만 후보로 삼음 */
  maxStationWalkM: 800,
  /** 후보 역은 가까운 순서로 이 개수까지 */
  nearestStations: 4,
  /** 직선거리 → 걷는 거리 보정 (길은 곧게 나 있지 않으므로) */
  detourFactor: 1.3,
  /** 길 고르는 계산에서 쓰는 어르신 걸음(초/m, 약 0.8m/s) */
  elderWalkSecPerM: 1.25,
  /** 화면에 보여 줄 걷는 시간 계산용 (4km/h 가량, m/분). 앱이 따로 어르신 걸음으로 보정함 */
  shownWalkMPerMin: 67,
  /** 열차를 기다리는 시간(초). 배차 간격의 절반쯤으로 가정 */
  waitSec: 180,
  /** 갈아타는 걸음은 자료 값의 이 배로 계산(어르신, 사람 많은 환승통로) */
  transferWalkFactor: 1.5,
  /** '갈아타기 적은 길'을 찾을 때, 갈아탈 때마다 더하는 벌점(초) */
  fewTransferPenaltySec: 900,
  /** 출발-도착 직선거리가 이보다 짧으면 지하철보다 걷기·버스가 나을 수 있어 넘김 */
  minTripStraightM: 1000,
} as const;

export interface RouteCoords { sx: number; sy: number; ex: number; ey: number }

type EdgeKind = 'ride' | 'xfer' | 'svc';
interface Edge { to: number; cost: number; kind: EdgeKind; sec: number; meters: number }

interface Walkable { id: string; walkM: number }

export interface SubwayRouter {
  /** 길 후보(빠른 길, 갈아타기 적은 길). 이 지도로 못 찾으면 null */
  findRoutes(c: RouteCoords): RouteCandidate[] | null;
  /** 이 지점 가까이의 후보 역(점검·테스트용) */
  nearbyStations(x: number, y: number): Array<{ id: string; name: string; line: number; meters: number }>;
}

export function metersBetween(ax: number, ay: number, bx: number, by: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(by - ay);
  const dLon = toRad(bx - ax);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(ay)) * Math.cos(toRad(by)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function createSubwayRouter(graph: SubwayGraph): SubwayRouter {
  const T = SUBWAY_TUNING;
  const stationById = new Map<string, StationTuple>();
  for (const s of graph.stations) stationById.set(s[0], s);

  // 노드 = (역, 열차 종류). 열차 종류가 하나뿐인 호선은 역마다 노드가 하나입니다.
  const nodeIndex = new Map<string, number>();
  const nodeStation: string[] = [];
  const nodesOfStation = new Map<string, number[]>();
  const nodeOf = (stationId: string, svc: number): number => {
    const key = `${stationId}#${svc}`;
    let i = nodeIndex.get(key);
    if (i === undefined) {
      i = nodeStation.length;
      nodeIndex.set(key, i);
      nodeStation.push(stationId);
      nodesOfStation.set(stationId, [...(nodesOfStation.get(stationId) ?? []), i]);
    }
    return i;
  };

  const baseEdges: Array<{ from: number; edge: Edge }> = [];
  const addEdge = (from: number, to: number, kind: EdgeKind, sec: number, meters: number) => {
    const cost = kind === 'ride' ? sec : sec * T.transferWalkFactor + T.waitSec;
    baseEdges.push({ from, edge: { to, cost, kind, sec, meters } });
  };

  for (const [a, b, sec, meters, directed, svcs] of graph.rides) {
    for (const svc of svcs) {
      const na = nodeOf(a, svc);
      const nb = nodeOf(b, svc);
      addEdge(na, nb, 'ride', sec, meters);
      if (!directed) addEdge(nb, na, 'ride', sec, meters);
    }
  }
  for (const [id, svcA, svcB, sec, meters] of graph.svcTransfers) {
    const na = nodeOf(id, svcA);
    const nb = nodeOf(id, svcB);
    addEdge(na, nb, 'svc', sec, meters);
    addEdge(nb, na, 'svc', sec, meters);
  }
  for (const [a, b, sec, meters] of graph.transfers) {
    for (const na of nodesOfStation.get(a) ?? []) {
      for (const nb of nodesOfStation.get(b) ?? []) {
        addEdge(na, nb, 'xfer', sec, meters);
        addEdge(nb, na, 'xfer', sec, meters);
      }
    }
  }
  const N = nodeStation.length;
  const adj: Edge[][] = Array.from({ length: N }, () => []);
  for (const { from, edge } of baseEdges) adj[from].push(edge);

  const nearby = (x: number, y: number): Walkable[] => {
    const list: Walkable[] = [];
    for (const s of graph.stations) {
      if (s[3] === null || s[4] === null) continue;
      const m = metersBetween(x, y, s[3], s[4]);
      if (m <= T.maxStationWalkM) list.push({ id: s[0], walkM: m });
    }
    list.sort((p, q) => p.walkM - q.walkM);
    // 같은 이름의 여러 호선 역은 한 곳으로 보고 세지 않음(환승역이 후보를 다 차지하지 않게)
    const seenNames = new Set<string>();
    const picked: Walkable[] = [];
    for (const w of list) {
      const name = stationById.get(w.id)![2];
      if (seenNames.has(name)) { picked.push(w); continue; }
      if (seenNames.size >= T.nearestStations) continue;
      seenNames.add(name);
      picked.push(w);
    }
    return picked;
  };

  interface Found { nodes: number[]; edges: Edge[]; startWalkM: number; endWalkM: number; cost: number }

  function search(origin: Walkable[], dest: Walkable[], penaltySec: number): Found | null {
    const dist = new Array<number>(N).fill(Infinity);
    const prev = new Array<number>(N).fill(-1);
    const prevEdge = new Array<Edge | null>(N).fill(null);
    const startWalk = new Array<number>(N).fill(0);
    const done = new Array<boolean>(N).fill(false);

    for (const o of origin) {
      for (const n of nodesOfStation.get(o.id) ?? []) {
        const c = o.walkM * T.detourFactor * T.elderWalkSecPerM + T.waitSec;
        if (c < dist[n]) { dist[n] = c; startWalk[n] = o.walkM; }
      }
    }
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      for (const e of adj[u]) {
        const c = dist[u] + e.cost + (e.kind === 'ride' ? 0 : penaltySec);
        if (c < dist[e.to]) {
          dist[e.to] = c;
          prev[e.to] = u;
          prevEdge[e.to] = e;
          startWalk[e.to] = startWalk[u];
        }
      }
    }

    let bestEnd = -1;
    let bestCost = Infinity;
    let endWalkM = 0;
    for (const d of dest) {
      for (const n of nodesOfStation.get(d.id) ?? []) {
        const c = dist[n] + d.walkM * T.detourFactor * T.elderWalkSecPerM;
        if (c < bestCost) { bestCost = c; bestEnd = n; endWalkM = d.walkM; }
      }
    }
    if (bestEnd < 0 || !Number.isFinite(bestCost)) return null;

    const nodes: number[] = [];
    const edges: Edge[] = [];
    for (let n = bestEnd; n >= 0; n = prev[n]) {
      nodes.push(n);
      const e = prevEdge[n];
      if (e) edges.push(e);
    }
    nodes.reverse();
    edges.reverse();
    return { nodes, edges, startWalkM: startWalk[nodes[0]], endWalkM, cost: bestCost };
  }

  const stationOf = (node: number): StationTuple => stationById.get(nodeStation[node])!;
  const roundWalkM = (m: number): number => Math.max(10, Math.round((m * T.detourFactor) / 10) * 10);
  const walkMin = (m: number): number => Math.max(1, Math.ceil(m / T.shownWalkMPerMin));

  function toBody(f: Found): { body: unknown; signature: string; transfers: number } | null {
    // 타는 구간(leg)으로 묶기
    interface Leg { nodes: number[]; sec: number; meters: number }
    const legs: Leg[] = [];
    const walks: Array<{ meters: number; sec: number }> = [];
    let cur: Leg = { nodes: [f.nodes[0]], sec: 0, meters: 0 };
    f.edges.forEach((e, i) => {
      const to = f.nodes[i + 1];
      if (e.kind === 'ride') {
        cur.nodes.push(to);
        cur.sec += e.sec;
        cur.meters += e.meters;
      } else {
        legs.push(cur);
        walks.push({ meters: e.meters, sec: e.sec });
        cur = { nodes: [to], sec: 0, meters: 0 };
      }
    });
    legs.push(cur);
    if (legs.some((l) => l.nodes.length < 2)) return null; // 타지 않고 갈아타기만 하는 길은 버림
    const first = stationOf(f.nodes[0]);
    const last = stationOf(f.nodes[f.nodes.length - 1]);
    if (first[0] === last[0]) return null;

    const startM = roundWalkM(f.startWalkM);
    const endM = roundWalkM(f.endWalkM);
    const subPath: unknown[] = [{ trafficType: 3, distance: startM, sectionTime: walkMin(startM) }];
    let totalSec = (startM / T.shownWalkMPerMin) * 60 + T.waitSec;
    legs.forEach((l, i) => {
      const from = stationOf(l.nodes[0]);
      const to = stationOf(l.nodes[l.nodes.length - 1]);
      const stations = l.nodes.map((n, k) => {
        const s = stationOf(n);
        const st: Record<string, unknown> = { index: k, stationID: s[5] ? `sm-${s[5]}` : `sm-${s[0]}`, stationName: s[2] };
        if (s[3] !== null && s[4] !== null) { st.x = String(s[3]); st.y = String(s[4]); }
        return st;
      });
      const leg: Record<string, unknown> = {
        trafficType: 1,
        distance: l.meters,
        sectionTime: Math.max(1, Math.round(l.sec / 60)),
        stationCount: l.nodes.length - 1,
        lane: [{ name: `수도권 ${from[1]}호선`, subwayCode: from[1] }],
        startName: from[2],
        endName: to[2],
        passStopList: { stations },
      };
      if (from[3] !== null && from[4] !== null) { leg.startX = from[3]; leg.startY = from[4]; }
      if (to[3] !== null && to[4] !== null) { leg.endX = to[3]; leg.endY = to[4]; }
      subPath.push(leg);
      totalSec += l.sec;
      if (i < walks.length) {
        const w = walks[i];
        subPath.push({ trafficType: 3, distance: w.meters, sectionTime: Math.max(1, Math.ceil(w.sec / 60)) });
        totalSec += w.sec + T.waitSec;
      }
    });
    subPath.push({ trafficType: 3, distance: endM, sectionTime: walkMin(endM) });
    totalSec += (endM / T.shownWalkMPerMin) * 60;

    const totalWalk = startM + endM + walks.reduce((a, w) => a + w.meters, 0);
    const signature = legs.map((l) => `${stationOf(l.nodes[0])[0]}>${stationOf(l.nodes[l.nodes.length - 1])[0]}`).join('/');
    return {
      signature,
      transfers: legs.length - 1,
      body: {
        result: {
          searchType: 0,
          path: [
            {
              pathType: 1,
              info: {
                totalTime: Math.max(1, Math.round(totalSec / 60)),
                busTransitCount: 0,
                subwayTransitCount: legs.length,
                totalWalk,
                firstStartStation: first[2],
                lastEndStation: last[2],
              },
              subPath,
            },
          ],
        },
      },
    };
  }

  function findRoutes(c: RouteCoords): RouteCandidate[] | null {
    if (![c.sx, c.sy, c.ex, c.ey].every((v) => Number.isFinite(v))) return null;
    if (metersBetween(c.sx, c.sy, c.ex, c.ey) < T.minTripStraightM) return null;
    const origin = nearby(c.sx, c.sy);
    const dest = nearby(c.ex, c.ey);
    if (origin.length === 0 || dest.length === 0) return null;

    const out: RouteCandidate[] = [];
    const seen = new Set<string>();
    for (const penalty of [0, T.fewTransferPenaltySec]) {
      const f = search(origin, dest, penalty);
      if (!f) continue;
      const built = toBody(f);
      if (!built || seen.has(built.signature)) continue;
      seen.add(built.signature);
      const parsed = parseOdsayResponse(built.body);
      for (const r of parsed) out.push({ ...r, id: `subway-${out.length}` });
    }
    if (out.length === 0) return null;
    out.sort((a, b) => a.totalTimeMin - b.totalTimeMin);
    return out;
  }

  return {
    findRoutes,
    nearbyStations(x, y) {
      return nearby(x, y).map((w) => {
        const s = stationById.get(w.id)!;
        return { id: s[0], name: s[2], line: s[1], meters: Math.round(w.walkM) };
      });
    },
  };
}
