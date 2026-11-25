/**
 * 서울 열린데이터광장에서 서울교통공사 지하철 자료(역 사이 시간, 환승 시간)의 새 파일이 있는지 보고, 있으면 받아 둡니다.
 *
 * 사용법:  npx tsx scripts/updateSubwayData.ts
 *   - 두 자료 페이지의 파일 목록에서 가장 최근 CSV를 고르고, 받아서 UTF-8로 바꿔 data/raw/seoul-metro/ 에 저장합니다.
 *   - 같은 내용이면 아무것도 바꾸지 않습니다. 새 파일이면 같은 자료의 옛 파일은 지우고 새 파일 하나만 남깁니다.
 *   - 역 좌표(공공데이터포털)는 받는 횟수가 많으면 사람 확인(CAPTCHA)이 나올 수 있어 자동으로 받지 않습니다.
 *     좌표는 역이 새로 생기거나 옮길 때만 바뀌므로, 지도 만들기가 새 역을 발견해 멈추면 그때 손으로 갱신합니다.
 * 받은 뒤 `npm run build:subway` 와 `npm test` 가 자료가 서로 맞는지 확인합니다(맞지 않으면 멈춤).
 */
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface SeoulFile {
  seq: string;
  kind: string;
  name: string;
  /** YYYY-MM-DD (표의 수정일) */
  modified: string;
}

export const DATASETS = [
  { id: 'OA-12034', prefix: '역간거리_및_소요시간', header: ['호선', '역명', '소요시간', '역간거리(km)'] },
  { id: 'OA-13290', prefix: '환승역거리_소요시간', header: ['호선', '환승역명', '환승노선', '환승거리', '환승소요시간'] },
] as const;

const PAGE = (id: string) => `https://data.seoul.go.kr/dataList/${id}/S/1/datasetView.do`;
const DOWNLOAD = 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false';

const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** 자료 페이지의 '파일내려받기' 표를 읽습니다. 표가 없거나 모양이 바뀌면 빈 목록을 돌려줍니다. */
export function parseFileRows(html: string): SeoulFile[] {
  const rows: SeoulFile[] = [];
  const re = /<tr id="fileTr_\d+">([\s\S]*?)<\/tr>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (cells.length < 5) continue;
    const kind = cells[1].replace(/<[^>]*>/g, '').trim();
    const nameMatch = /<span title="([^"]*)" onclick="javascript:downloadFile\('(\d+)'\);?"/.exec(cells[2]);
    const date = /(\d{4})\.(\d{2})\.(\d{2})/.exec(cells[4]);
    if (!nameMatch || !date) continue;
    rows.push({ seq: nameMatch[2], kind, name: unescapeHtml(nameMatch[1]), modified: `${date[1]}-${date[2]}-${date[3]}` });
  }
  return rows;
}

/** '데이터' 종류의 CSV 중 수정일이 가장 늦은 것(같으면 표에서 위에 있는 것) */
export function pickNewestCsv(files: SeoulFile[]): SeoulFile | null {
  let best: SeoulFile | null = null;
  for (const f of files) {
    if (f.kind !== '데이터' || !/\.csv$/i.test(f.name)) continue;
    if (!best || f.modified > best.modified) best = f;
  }
  return best;
}

/** 파일 이름 속 날짜(6자리 yymmdd 또는 8자리)를 8자리로. 없으면 표의 수정일 */
export function fileDate(f: SeoulFile): string {
  const m = /(\d{8}|\d{6})/.exec(f.name);
  if (m) return m[1].length === 6 ? `20${m[1]}` : m[1];
  return f.modified.replace(/-/g, '');
}

export const targetName = (prefix: string, f: SeoulFile): string => `${prefix}_${fileDate(f)}.csv`;

/** UTF-8이면 그대로, 아니면 EUC-KR(CP949)로 읽습니다. 서울시 파일은 대개 CP949입니다. */
export function decodeKorean(buf: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

async function getPage(id: string): Promise<string> {
  const res = await fetch(PAGE(id));
  if (!res.ok) throw new Error(`${id} 자료 페이지를 열지 못했어요 (HTTP ${res.status}).`);
  return res.text();
}

async function download(id: string, seq: string): Promise<Uint8Array> {
  const res = await fetch(DOWNLOAD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ infId: id, seq, infSeq: '1' }),
  });
  if (!res.ok) throw new Error(`${id} 파일 받기 실패 (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dir = path.join(root, 'data', 'raw', 'seoul-metro');
  mkdirSync(dir, { recursive: true });
  return (async () => {
    for (const ds of DATASETS) {
      const files = parseFileRows(await getPage(ds.id));
      const newest = pickNewestCsv(files);
      if (!newest) throw new Error(`${ds.id}: 파일 목록에서 CSV를 찾지 못했어요. 서울시 페이지 모양이 바뀌었는지 확인해 주세요.`);

      const text = decodeKorean(await download(ds.id, newest.seq));
      const head = text.split(/\r?\n/)[0].split(',').map((h) => h.trim());
      for (const col of ds.header) {
        if (!head.includes(col)) throw new Error(`${ds.id}: 받은 파일에 '${col}' 칸이 없어요 (있는 칸: ${head.join(', ')}). 받은 파일이 맞는지 확인해 주세요.`);
      }
      if (text.split(/\r?\n/).filter((l) => l.trim()).length < 10) throw new Error(`${ds.id}: 받은 파일이 너무 짧아요.`);
      const body = text.endsWith('\n') ? text : text + '\n';

      const existing = readdirSync(dir).filter((f) => f.startsWith(ds.prefix));
      if (existing.some((f) => readFileSync(path.join(dir, f), 'utf-8').replace(/\r\n/g, '\n') === body.replace(/\r\n/g, '\n')) && existing.length === 1) {
        console.log(`${ds.id}: 바뀐 것 없음 (${existing[0]})`);
        continue;
      }
      const out = targetName(ds.prefix, newest);
      writeFileSync(path.join(dir, out), body, 'utf-8');
      for (const f of existing) if (f !== out) unlinkSync(path.join(dir, f));
      console.log(`${ds.id}: 새 자료 ${newest.name} (수정일 ${newest.modified}) → ${out}${existing.length ? ` (옛 파일 ${existing.join(', ')} 지움)` : ''}`);
    }
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(`오류: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}

