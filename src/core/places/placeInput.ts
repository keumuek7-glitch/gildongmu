/** 목적지 글자 입력 도우미 (화면 없이 시험할 수 있는 순수 함수들) */

/** 장소 후보는 한 번에 하나씩 보여 주므로 많이 가져와도 소용없어요. */
export const MAX_PLACE_CANDIDATES = 5;

/** 앞뒤 빈칸을 없애고 가운데 빈칸은 한 칸으로 */
export function normalizePlaceText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** 입력칸에 미리 써 둔 곳(즐겨찾기·가족이 보낸 곳)을 고치지 않고 그대로 눌렀는지. 빈칸·대소문자는 무시 */
export function isSameAsPrefilled(text: string, prefilled: string): boolean {
  const norm = (v: string) => normalizePlaceText(v).replace(/ /g, '').toLowerCase();
  const a = norm(text);
  return a !== '' && a === norm(prefilled);
}

/** 후보 목록에서 보여 줄 만큼만 */
export function limitCandidates<T>(list: readonly T[]): T[] {
  return list.slice(0, MAX_PLACE_CANDIDATES);
}
