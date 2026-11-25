/**
 * 서울교통공사 공개 자료 3개 → src/data/subwayGraph.json (앱이 직접 지하철 길을 계산할 때 쓰는 지도)
 *
 * 사용법:  npm run build:subway
 *   입력: data/raw/seoul-metro/ 안의 CSV 3개 (UTF-8)
 *     1) 역간거리_및_소요시간_*.csv      서울 열린데이터광장 OA-12034  (역과 역 사이 시간·거리)
 *     2) 환승역거리_소요시간_*.csv        서울 열린데이터광장 OA-13290  (갈아타는 거리·시간)
 *     3) 1_8호선_역사_좌표_*.csv          공공데이터포털 15099316       (역 좌표)
 *
 * 자료에서 알 수 없는 것은 아래 상수에 사람이 적어 둡니다(이름 다른 역, 지선 분기, 한 방향 순환).
 * 자료가 바뀌어 이 상수와 맞지 않으면 조용히 틀린 지도를 만들지 않고, 이유를 적어 멈춥니다.
 * 저작: 서울교통공사 (공공누리 1유형 / 이용허락범위 제한 없음). 출처를 밝히고 쓰면 됩니다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RideTuple, StationTuple, SubwayGraph, SvcTransferTuple, TransferTuple } from '../src/core/subwayGraphTypes';

export type { RideTuple, StationTuple, SubwayGraph, SvcTransferTuple, TransferTuple };

export interface RawFiles { gaps: string; transfers: string; coords: string }

/** 파일마다 다르게 적힌 역 이름을 하나로 맞춥니다. 화면에는 오른쪽 이름이 나옵니다. */
export const NAME_ALIASES: Record<string, string> = {
  서울: '서울역', // 좌표 파일은 '서울', 시간 파일은 '서울역'
  신내역: '신내', // 6호선
  이수: '총신대입구', // 7호선 이수 = 총신대입구(이수), 4호선 쪽 이름에 맞춤
  자양: '뚝섬유원지', // 7호선, 옛 이름
};

/** 좌표 파일에 아직 없는 역 (길 중간에는 지나갈 수 있지만, 출발·도착 근처 역으로는 고르지 않음) */
export const NO_COORDS = new Set(['8|암사역사공원']);

/**
 * 같은 호선이라도 열차가 다니는 갈래가 다른 곳. 열차 종류 번호(svc)가 다르면 같은 역에서 갈아타야 합니다.
 *  - 2호선: 0 본선 순환, 1 성수지선(성수-신설동 왕복), 2 신정지선(신도림-까치산 왕복)
 *  - 5호선: 0 방화-마천, 1 방화-하남검단산 (강동까지 같은 길)
 * start: 이 갈래가 시작되는 역(파일 순서상 첫 줄), from: 파일 순서와 달리 실제로 이어지는 역
 */
export const SEGMENTS: Record<number, Array<{ start: string; from?: string; svcs: number[] }>> = {
  2: [
    { start: '시청', svcs: [0] },
    { start: '용답', from: '성수', svcs: [1] },
    { start: '도림천', from: '신도림', svcs: [2] },
  ],
  5: [
    { start: '방화', svcs: [0, 1] },
    { start: '길동', svcs: [1] },
    { start: '둔촌동', from: '강동', svcs: [0] },
  ],
};

/** 한 방향으로만 도는 순환선 (6호선 응암순환: 응암 → 역촌 → … → 구산 → 응암) */
export const ONE_WAY_LOOP_LINES = new Set([6]);

const MAX_LINE = 8;

/**
 * 좌표 점검: 옆 역까지 직선거리가 선로 거리(시간 파일 값)와 너무 다르면 좌표가 틀린 것으로 봅니다.
 * (선로 거리보다 직선거리가 훨씬 길 수는 없고, 너무 짧은 것도 이상합니다. 실제 자료에서 잠실새내·용답·신답·발산 등이 걸렸습니다.)
 * 어느 쪽이 틀렸는지 알 수 없으면 두 역 모두 좌표를 쓰지 않습니다. 그 역은 길 중간에는 지나가지만,
 * 출발·도착 근처 역으로 고르거나 걷기 안내의 방향 계산에 쓰지 않습니다. 틀린 좌표로 어르신을 엉뚱한 쪽으로 보내지 않기 위해서입니다.
 */
export const COORD_RATIO_MAX = 1.5;
export const COORD_RATIO_MIN = 0.4;

function metersBetween(ax: number, ay: number, bx: number, by: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(by - ay);
  const dLon = toRad(bx - ax);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(ay)) * Math.cos(toRad(by)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function findSuspectCoords(stations: StationTuple[], rides: RideTuple[]): string[] {
  const pos = new Map<string, { x: number; y: number }>();
  for (const s of stations) if (s[3] !== null && s[4] !== null) pos.set(s[0], { x: s[3], y: s[4] });
  let bad: Array<[string, string]> = [];
  for (const [a, b, , meters] of rides) {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb || meters <= 0) continue;
    const ratio = metersBetween(pa.x, pa.y, pb.x, pb.y) / meters;
    if (ratio > COORD_RATIO_MAX || ratio < COORD_RATIO_MIN) bad.push([a, b]);
  }
  const dropped = new Set<string>();
  while (bad.length) {
    const count = new Map<string, number>();
    for (const [a, b] of bad) { count.set(a, (count.get(a) ?? 0) + 1); count.set(b, (count.get(b) ?? 0) + 1); }
    const worst = Math.max(...count.values());
    if (worst >= 2) {
      // 틀린 줄이 둘 이상 걸린 역이 거의 확실히 틀린 역
      for (const [id, c] of count) if (c === worst) dropped.add(id);
    } else {
      // 한 줄씩만 걸리면 어느 쪽이 틀렸는지 알 수 없으므로 둘 다
      for (const [a, b] of bad) { dropped.add(a); dropped.add(b); }
    }
    bad = bad.filter(([a, b]) => !dropped.has(a) && !dropped.has(b));
  }
  return [...dropped].sort();
}

export const SOURCE_NOTES = [
  '서울교통공사_역간거리 및 소요시간_240810.csv (서울 열린데이터광장 OA-12034)',
  '서울교통공사_환승역거리 소요시간 정보_20250331.csv (서울 열린데이터광장 OA-13290)',
  '서울교통공사_1_8호선 역사 좌표(위경도) 정보_20250814.csv (공공데이터포털 15099316)',
];

function parseCsv(text: string, required: string[], label: string): Array<Record<string, string>> {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error(`${label}: 내용이 비어 있어요.`);
  const head = lines[0].split(',').map((h) => h.trim());
  for (const col of required) {
    if (!head.includes(col)) throw new Error(`${label}: '${col}' 칸이 없어요. 자료 형식이 바뀌었는지 확인해 주세요. (있는 칸: ${head.join(', ')})`);
  }
  return lines.slice(1).map((l, i) => {
    const cells = l.split(',');
    if (cells.length !== head.length) throw new Error(`${label}: ${i + 2}번째 줄의 칸 수가 맞지 않아요.`);
    const row: Record<string, string> = {};
    head.forEach((h, k) => { row[h] = cells[k].trim(); });
    return row;
  });
}

function mmss(v: string, label: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) throw new Error(`${label}: 시간 '${v}' 를 읽지 못했어요. (분:초 형식이어야 해요)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

const canon = (n: string): string => {
  const t = n.trim();
  return NAME_ALIASES[t] ?? t;
};
const sid = (line: number, name: string): string => `${line}|${name}`;

function lineNo(v: string, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LINE) throw new Error(`${label}: 호선 '${v}' 를 읽지 못했어요.`);
  return n;
}

export function buildSubwayGraph(files: RawFiles): SubwayGraph {
  const gaps = parseCsv(files.gaps, ['호선', '역명', '소요시간', '역간거리(km)'], '역간거리 파일');
  const trs = parseCsv(files.transfers, ['호선', '환승역명', '환승노선', '환승거리', '환승소요시간'], '환승 파일');
  const coords = parseCsv(files.coords, ['호선', '고유역번호(외부역코드)', '역명', '위도', '경도'], '좌표 파일');

  // 1) 호선별로 파일 순서 그대로 묶기
  const byLine = new Map<number, typeof gaps>();
  for (const r of gaps) {
    const ln = lineNo(r['호선'], '역간거리 파일');
    if (!byLine.has(ln)) byLine.set(ln, []);
    byLine.get(ln)!.push(r);
  }

  // 2) 역 목록 (처음 나온 순서)
  const stationIds: string[] = [];
  const stationMeta = new Map<string, { line: number; name: string }>();
  for (const [ln, rows] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    for (const r of rows) {
      const name = canon(r['역명']);
      const id = sid(ln, name);
      if (!stationMeta.has(id)) {
        stationMeta.set(id, { line: ln, name });
        stationIds.push(id);
      }
    }
  }

  // 3) 좌표 붙이기 (모르는 역·이름 어긋남은 멈춤)
  const coordMap = new Map<string, { x: number; y: number; code: string }>();
  for (const r of coords) {
    const id = sid(lineNo(r['호선'], '좌표 파일'), canon(r['역명']));
    if (coordMap.has(id)) throw new Error(`좌표 파일: ${id} 가 두 번 나와요.`);
    const x = Number(r['경도']);
    const y = Number(r['위도']);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`좌표 파일: ${id} 의 좌표를 읽지 못했어요.`);
    coordMap.set(id, { x, y, code: r['고유역번호(외부역코드)'] });
  }
  const noCoordFound = stationIds.filter((id) => !coordMap.has(id) && !NO_COORDS.has(id));
  if (noCoordFound.length) throw new Error(`좌표를 못 찾은 역: ${noCoordFound.join(', ')}. NAME_ALIASES 에 이름 연결을 추가해야 할 수 있어요.`);
  const extraCoords = [...coordMap.keys()].filter((id) => !stationMeta.has(id));
  if (extraCoords.length) throw new Error(`시간 파일에 없는 좌표 역: ${extraCoords.join(', ')}. 새 역이 생겼거나 이름이 달라졌을 수 있어요.`);

  const stations: StationTuple[] = stationIds.map((id) => {
    const m = stationMeta.get(id)!;
    const c = coordMap.get(id);
    return [id, m.line, m.name, c ? c.x : null, c ? c.y : null, c ? c.code : null];
  });

  // 4) 역과 역 사이 (타는 구간)
  const rides: RideTuple[] = [];
  for (const [ln, rows] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const segs = SEGMENTS[ln] ?? [{ start: canon(rows[0]['역명']), svcs: [0] }];
    let segIdx = 0;
    let prev: string | null = null;
    const seen = new Set<string>();
    let loopOpen = ONE_WAY_LOOP_LINES.has(ln);

    rows.forEach((r, i) => {
      const name = canon(r['역명']);
      const id = sid(ln, name);
      const label = `역간거리 파일 ${ln}호선 ${name}`;
      const next = segs[segIdx + 1];
      let anchor: string | null = null;
      if (next && next.start === name) {
        segIdx += 1;
        if (next.from) anchor = sid(ln, next.from);
      }
      if (i === 0) {
        if (r['소요시간'] !== '00:00') throw new Error(`${label}: 첫 역의 시간이 00:00 이 아니에요.`);
        prev = id;
        seen.add(id);
        return;
      }
      const from = anchor ?? prev!;
      if (!stationMeta.has(from)) throw new Error(`${label}: 이어지는 역 ${from} 를 찾지 못했어요.`);
      const sec = mmss(r['소요시간'], label);
      const km = Number(r['역간거리(km)']);
      if (sec <= 0 || !Number.isFinite(km) || km <= 0) throw new Error(`${label}: 시간이나 거리 값이 이상해요. (${r['소요시간']}, ${r['역간거리(km)']})`);
      const closesLoop = seen.has(id);
      const directed: 0 | 1 = loopOpen ? 1 : 0;
      rides.push([from, id, sec, Math.round(km * 1000), directed, [...segs[segIdx].svcs]]);
      if (closesLoop && loopOpen) loopOpen = false;
      seen.add(id);
      prev = id;
    });
    if (ONE_WAY_LOOP_LINES.has(ln) && loopOpen) throw new Error(`${ln}호선: 한 방향 순환이 닫히지 않았어요. 파일 순서가 바뀌었는지 확인해 주세요.`);
  }

  // 5) 같은 호선 안 갈래 갈아타기 + 다른 호선 갈아타기
  const svcTransfers: SvcTransferTuple[] = [];
  const anchorSet = new Set<string>();
  for (const [ln, segs] of Object.entries(SEGMENTS)) {
    for (const s of segs) if (s.from) anchorSet.add(sid(Number(ln), s.from));
  }
  const selfFound = new Set<string>();
  const pairMap = new Map<string, TransferTuple>();
  for (const r of trs) {
    const ln = lineNo(r['호선'], '환승 파일');
    const name = canon(r['환승역명']);
    const idA = sid(ln, name);
    const m = /^(\d)호선$/.exec(r['환승노선']);
    if (!m) continue; // 공항철도·9호선·신분당선 등 이 지도에 없는 노선
    const target = Number(m[1]);
    if (target < 1 || target > MAX_LINE) continue;
    if (!stationMeta.has(idA)) throw new Error(`환승 파일: ${idA} 를 시간 파일에서 찾지 못했어요. NAME_ALIASES 를 확인해 주세요.`);
    const sec = mmss(r['환승소요시간'], `환승 파일 ${idA}`);
    const meters = Number(r['환승거리']);
    if (!Number.isFinite(meters) || meters < 0) throw new Error(`환승 파일: ${idA} 의 환승 거리를 읽지 못했어요.`);

    if (target === ln) {
      selfFound.add(idA);
      const segs = SEGMENTS[ln];
      if (!segs) throw new Error(`환승 파일: ${idA} 가 같은 호선 환승으로 적혀 있는데, SEGMENTS 에 ${ln}호선이 없어요.`);
      continue;
    }
    const idB = sid(target, name);
    if (!stationMeta.has(idB)) continue; // 상대 호선이 이 지도에 없는 구간(예: 코레일 1호선)
    const key = [idA, idB].sort().join('~');
    const old = pairMap.get(key);
    if (!old) pairMap.set(key, [idA, idB, sec, Math.round(meters)]);
    else if (sec > old[2]) pairMap.set(key, [old[0], old[1], sec, Math.round(meters)]); // 양쪽이 다르면 더 긴 쪽(안전)
  }
  // 같은 호선 갈래 갈아타기: 자료에 적힌 역과 우리가 적어 둔 분기 역이 정확히 같아야 함
  const anchorsMissing = [...anchorSet].filter((a) => !selfFound.has(a));
  const selfUnexpected = [...selfFound].filter((a) => !anchorSet.has(a));
  if (anchorsMissing.length || selfUnexpected.length) {
    throw new Error(`갈래(지선) 환승 역이 자료와 달라요. 자료에 없음: [${anchorsMissing.join(', ')}] 자료에만 있음: [${selfUnexpected.join(', ')}]. SEGMENTS 를 고쳐야 해요.`);
  }
  // 갈래가 갈라지는 역에서, 그 역을 지나는 열차 종류끼리 서로 갈아탈 수 있게 이음 (걸리는 시간은 환승 파일 값)
  const svcAt = new Map<string, Set<number>>();
  for (const e of rides) for (const id of [e[0], e[1]]) {
    if (!svcAt.has(id)) svcAt.set(id, new Set());
    e[5].forEach((v) => svcAt.get(id)!.add(v));
  }
  for (const r of trs) {
    const ln = lineNo(r['호선'], '환승 파일');
    if (r['환승노선'] !== `${ln}호선`) continue;
    const id = sid(ln, canon(r['환승역명']));
    const sec = mmss(r['환승소요시간'], `환승 파일 ${id}`);
    const meters = Math.round(Number(r['환승거리']));
    const kinds = [...(svcAt.get(id) ?? [])].sort((x, y) => x - y);
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      svcTransfers.push([id, kinds[i], kinds[j], sec, meters]);
    }
  }
  const transfers = [...pairMap.values()];

  // 6) 같은 이름이 여러 호선에 있는데 갈아타는 줄이 하나도 없으면 멈춤
  const byName = new Map<string, string[]>();
  for (const id of stationIds) {
    const n = stationMeta.get(id)!.name;
    byName.set(n, [...(byName.get(n) ?? []), id]);
  }
  const linked = new Set<string>();
  for (const t of transfers) { linked.add(t[0]); linked.add(t[1]); }
  const orphan: string[] = [];
  for (const [n, ids] of byName) if (ids.length > 1) for (const id of ids) if (!linked.has(id)) orphan.push(`${n}(${id})`);
  if (orphan.length) throw new Error(`같은 이름의 역인데 갈아타는 자료가 없어요: ${orphan.join(', ')}`);

  const unused = findSuspectCoords(stations, rides);
  const unusedSet = new Set(unused);
  const finalStations: StationTuple[] = stations.map((t) => (unusedSet.has(t[0]) ? [t[0], t[1], t[2], null, null, t[5]] : t));

  return {
    meta: {
      sources: SOURCE_NOTES,
      unusedCoords: unused,
      stationCount: finalStations.length,
      note: '서울교통공사 1~8호선 구간만 담겨 있어요. 9호선·공항철도·신분당선·경의중앙선·코레일 구간은 들어 있지 않아요.',
    },
    stations: finalStations,
    rides,
    transfers,
    svcTransfers,
  };
}

/** 한 줄에 하나씩 적어서, 자료가 바뀌었을 때 바뀐 줄만 눈에 띄게 합니다. */
export function formatGraph(g: SubwayGraph): string {
  const block = (arr: unknown[]) => '[\n' + arr.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]';
  return (
    '{\n' +
    `  "meta": ${JSON.stringify(g.meta)},\n` +
    `  "stations": ${block(g.stations)},\n` +
    `  "rides": ${block(g.rides)},\n` +
    `  "transfers": ${block(g.transfers)},\n` +
    `  "svcTransfers": ${block(g.svcTransfers)}\n` +
    '}\n'
  );
}

function pick(dir: string, prefix: string): string {
  const hit = readdirSync(dir).filter((f) => f.startsWith(prefix)).sort().pop();
  if (!hit) throw new Error(`${dir} 안에 '${prefix}' 로 시작하는 파일이 없어요.`);
  return readFileSync(path.join(dir, hit), 'utf-8');
}

function main(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'data', 'raw', 'seoul-metro');
  const graph = buildSubwayGraph({
    gaps: pick(dir, '역간거리'),
    transfers: pick(dir, '환승역거리'),
    coords: pick(dir, '1_8호선_역사_좌표'),
  });
  const out = path.join(root, 'src', 'data', 'subwayGraph.json');
  writeFileSync(out, formatGraph(graph), 'utf-8');
  console.log(`역 ${graph.stations.length}개, 타는 구간 ${graph.rides.length}개, 갈아타기 ${graph.transfers.length}쌍, 갈래 갈아타기 ${graph.svcTransfers.length}개 → ${path.relative(root, out)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
