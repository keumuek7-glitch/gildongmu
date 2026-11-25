/**
 * 큰 노선 띠에 쓸 글자 (위에서 아래로 한 줄씩).
 *  전철:  1호선 / 타는 역 청량리 / 다음 역 제기동 / 내리는 역 종로5가
 *  버스:  153번 / 타는 곳 … / 다음 … / 내리는 곳 …
 * 화살표(➡)는 쓰지 않습니다. 승강장·정류장에서 열차·버스가 들어오는 쪽(왼쪽·오른쪽)은
 * 서 있는 자리마다 달라서, 폰의 화살표가 실제 방향과 어긋날 수 있기 때문이에요.
 * 경로 데이터에 있는 이름만 씁니다. 이름이 비었거나 앞 이름과 같으면 건너뛰고, 없는 이름은 지어내지 않아요.
 */
import type { RideLeg } from './routeLegBuilder';

export interface StripStop {
  role: 'board' | 'next' | 'alight';
  /** 이름 앞에 붙는 작은 글자 (예: "타는 역") */
  label: string;
  name: string;
}

/** "청량리(서울시립대입구)" → "청량리": 끝의 괄호 설명만 떼어 글자를 짧게 */
function plainName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** 띠 맨 위에 쓸 노선 이름 (예: "1호선", "153번") */
export function stripLineLabel(leg: RideLeg): string {
  if (leg.type === 'BUS_LEG') return leg.busNo ? `${leg.busNo}번` : '버스';
  return leg.lineKey;
}

const LABELS = {
  SUBWAY_LEG: { board: '타는 역', next: '다음 역', alight: '내리는 역' },
  BUS_LEG: { board: '타는 곳', next: '다음', alight: '내리는 곳' },
} as const;

/**
 * [타는 곳 · 다음 · 내리는 곳] 이름과 이름표. 빈 이름은 빼고,
 * 앞과 같은 이름이면(한 정거장만 가는 경우) 내리는 곳 이름표 하나만 남깁니다.
 */
export function routeStripStops(leg: RideLeg): StripStop[] {
  const labels = LABELS[leg.type];
  const picks: Array<[StripStop['role'], string | undefined]> = [
    ['board', leg.stations[0] ?? leg.boardName],
    ['next', leg.nextStation ?? leg.stations[1]],
    ['alight', leg.alightName],
  ];
  const stops: StripStop[] = [];
  for (const [role, raw] of picks) {
    const name = plainName(raw);
    if (!name) continue;
    const last = stops[stops.length - 1];
    if (last && last.name === name) {
      if (role === 'alight') stops[stops.length - 1] = { role, label: labels[role], name };
      continue;
    }
    stops.push({ role, label: labels[role], name });
  }
  return stops;
}
