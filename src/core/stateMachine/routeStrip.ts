/**
 * 큰 노선 띠에 쓸 글자.
 *  전철: "1호선  청량리 ➡ 회기 ➡ 내리는 역"
 *  버스: "153번  타는 정류장 ➡ 다음 정류장 ➡ 내리는 정류장"
 * 경로 데이터에 있는 이름만 씁니다. 이름이 비었거나 앞 이름과 같으면 건너뛰고, 없는 이름은 지어내지 않아요.
 */
import type { RideLeg } from './routeLegBuilder';

/** "청량리(서울시립대입구)" → "청량리": 끝의 괄호 설명만 떼어 글자를 짧게 */
function plainName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** 띠 맨 앞에 쓸 노선 이름 (예: "1호선", "153번") */
export function stripLineLabel(leg: RideLeg): string {
  if (leg.type === 'BUS_LEG') return leg.busNo ? `${leg.busNo}번` : '버스';
  return leg.lineKey;
}

/** [탑승(현재) ➡ 다음 ➡ 내리는 곳] 이름. 이웃한 같은 이름과 빈 이름은 뺍니다. */
export function routeStripNames(leg: RideLeg): string[] {
  const picks = [leg.stations[0] ?? leg.boardName, leg.nextStation ?? leg.stations[1], leg.alightName];
  const names: string[] = [];
  for (const raw of picks) {
    const name = plainName(raw);
    if (name && name !== names[names.length - 1]) names.push(name);
  }
  return names;
}
