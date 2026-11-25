/**
 * 역방향 탑승 예방.
 *  1) 타기 전: 안내판·버스 화면에서 방면/다음 역(정류장)을 직접 확인하게 묻고,
 *     "아니요"면 타지 말고 반대편으로 가도록 안내 (경로 데이터에 있는 이름만 씀)
 *  2) 버스 탄 뒤: GPS상 내릴 곳에서 계속 멀어지면 "반대로 가는 것 같아요"
 * 전철 탄 뒤 감지는 기존 상태 머신(WRONG_DIRECTION_SUSPECTED)이 맡습니다.
 */
import type { RideLeg } from '../stateMachine/routeLegBuilder';

export interface BoardingCheck {
  /** 큰 글씨 질문 */
  question: string;
  /** 확인할 이름 (크게 보여 줄 것) */
  lookFor: string;
  /** "네" 눌렀을 때 */
  okText: string;
  /** "아니요" 눌렀을 때 */
  wrongTitle: string;
  wrongLines: string[];
  /** "잘 모르겠어요" 눌렀을 때 */
  unsureLines: string[];
}

const q = (s: string) => `'${s}'`;

/** 마지막 글자 받침: null=한글 아님, 0=없음, 8=ㄹ, 그 밖=있음 */
function jong(word: string): number | null {
  const w = word.trim().replace(/['"’”)]+$/, '');
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
  if (c >= 0x30 && c <= 0x39) return [1, 1, 0, 1, 0, 0, 1, 1, 1, 0][c - 0x30]; // 0영 1일 2이 3삼 4사 5오 6육 7칠 8팔 9구 (대략)
  return null;
}
/** 이/가, 을/를, 은/는, 으로/로, 인가요/인가요 */
export function josa(word: string, withB: string, without: string): string {
  const j = jong(word);
  if (withB === '으로') return word + (j && j !== 8 ? '으로' : '로');
  return word + (j ? withB : without);
}

export function boardingCheckFor(leg: RideLeg): BoardingCheck {
  const next = leg.nextStation && leg.nextStation !== leg.boardName ? leg.nextStation : undefined;
  const target = leg.alightName;
  if (leg.type === 'SUBWAY_LEG') {
    const lookFor = leg.way ? `${leg.way} 방면` : next ? `다음 역 ${next}` : `${target} 방향`;
    return {
      question: leg.way
        ? `타는 곳 안내판에 ${josa(q(`${leg.way} 방면`), '이', '가')} 보이나요?`
        : next
          ? `타는 곳 안내판에 다음 역이 ${josa(q(next), '으로', '로')} 적혀 있나요?`
          : `타는 곳 안내판에 ${q(target)} 방향이 보이나요?`,
      lookFor,
      okText: '맞아요. 이쪽에서 열차를 타세요',
      wrongTitle: '반대 방향이에요. 이 열차는 타지 마세요',
      wrongLines: [
        `안내판에서 ${josa(q(lookFor), '을', '를')} 찾아 그쪽 타는 곳으로 가세요`,
        '건너편 타는 곳이면 계단이나 승강기로 건너가요',
        `모르면 역무원에게 "${target} 가요?" 하고 물어보세요`,
      ],
      unsureLines: [`역무원이나 옆 사람에게 "${target} 가는 열차 여기서 타요?" 하고 물어보세요`],
    };
  }
  const bus = leg.busNo ? `${leg.busNo}번` : '버스';
  return {
    question: next
      ? `정류장 안내판이나 버스 앞 화면에서 다음 정류장이 ${q(next)}인가요?`
      : `버스 앞 화면에 ${josa(q(bus), '이', '가')} 보이나요?`,
    lookFor: next ? `다음 정류장 ${next}` : bus,
    okText: '맞아요. 이 버스를 타세요',
    wrongTitle: '반대 방향 정류장일 수 있어요. 타지 마세요',
    wrongLines: [
      '길 건너편 정류장에서 타야 할 수 있어요',
      `건너편 정류장에서 ${next ? `다음 정류장이 ${q(next)}인지` : `${q(bus)}인지`} 다시 확인하세요`,
      `모르면 기사님께 "${target} 가요?" 하고 물어보세요`,
    ],
    unsureLines: [`탈 때 기사님께 "${target} 가요?" 하고 물어보세요`],
  };
}

/* ── 버스 탄 뒤: 내릴 곳에서 멀어지는지 ───────────────── */

/** 가장 가까웠던 거리보다 이만큼 더 멀어지면 반대 방향으로 의심 */
export const BUS_AWAY_MARGIN_M = 300;

export interface AwayTracker {
  minDistM: number | null;
  warned: boolean;
}

export const newAwayTracker = (): AwayTracker => ({ minDistM: null, warned: false });

/**
 * 거리 하나를 넣고, 새로 경고해야 하면 true.
 * 버스 길이 구불구불해 잠깐 멀어질 수 있어 여유(300m)를 둡니다. 한 구간에 한 번만 경고.
 */
export function trackAway(t: AwayTracker, distM: number, margin = BUS_AWAY_MARGIN_M): boolean {
  if (!Number.isFinite(distM)) return false;
  if (t.minDistM == null || distM < t.minDistM) {
    t.minDistM = distM;
    return false;
  }
  if (!t.warned && distM - t.minDistM > margin) {
    t.warned = true;
    return true;
  }
  return false;
}
