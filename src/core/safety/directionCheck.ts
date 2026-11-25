/**
 * 역방향 탑승 예방.
 *  1) 전철: 환승 구간에서 "○○방면으로 걸어가고 있나요?"(1차), 승강장에서 "○○역 ➡ ○○역 방향이 맞나요?"(2차)를 묻고,
 *     "아니오·잘 몰라요"면 왔던 길로 돌아가 ○○방면으로 가도록 안내
 *  2) 버스: 다음 정류장을 묻지 않고, 타기 전에 기사님께 "○○ 방향이 맞는지" 물어보도록 안내
 *  (경로 데이터에 있는 이름만 씀 — 없는 이름은 지어내지 않음)
 *  3) 버스 탄 뒤: GPS상 내릴 곳에서 계속 멀어지면 "지나친 것 같아요"
 * 전철 탄 뒤 감지는 기존 상태 머신(WRONG_DIRECTION_SUSPECTED)이 맡습니다.
 */
import type { RideLeg } from '../stateMachine/routeLegBuilder';

export interface BoardingCheck {
  /** 큰 글씨 한 문장 (질문 또는 지시) */
  question: string;
  /** 확인할 방향 이름 (예: "서울역 방면", "종로5가 방향") */
  lookFor: string;
  /** [맞아요] 쪽 버튼 글자 */
  yesLabel: string;
  /** [아니오·잘 몰라요] 쪽 버튼 글자 (둘을 한 버튼으로 합쳐 확인 전에는 못 타게 함) */
  noLabel: string;
  /** "맞아요" 눌렀을 때 */
  okText: string;
  /** "아니오·잘 몰라요" 눌렀을 때 큰 글씨 한 문장 */
  wrongTitle: string;
  /** 말소리로만 읽어 주는 이어지는 안내 */
  wrongLines: string[];
}

const q = (s: string) => `'${s}'`;

/** 마지막 글자 받침: null=한글 아님, 0=없음, 8=ㄹ, 그 밖=있음 */
function jong(word: string): number | null {
  const w = word.trim().replace(/['"’”]+$/, '').replace(/\s*\([^)]*\)$/, '').replace(/['"’”]+$/, '');
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

/** '청량리' → '청량리역' (이미 '역'으로 끝나면 그대로, 괄호 설명은 뗌) */
export function stationLabel(name: string): string {
  const n = name.trim().replace(/\s*\([^)]*\)$/, '');
  return n.endsWith('역') ? n : `${n}역`;
}

/** 전철 방향 이름: 방면 정보가 있으면 "○○ 방면", 없으면 내릴 곳 기준 "○○ 방향" */
function subwayDirection(leg: RideLeg): string {
  return leg.way ? `${leg.way} 방면` : `${leg.alightName} 방향`;
}

/** 왔던 길로 돌아가 그 방면으로 가라는 큰 글씨 한 문장 (전철 1차·2차 공통) */
function goBackSentence(dir: string): string {
  return `왔던 길로 돌아가서 ${josa(q(dir), '으로', '로')} 가세요`;
}

/**
 * 전철 1차 확인: 환승 구간을 걷는 동안 "○○방면으로 걸어가고 있나요?"
 * nextRide 는 갈아탈 전철(RideLeg). 아니오·잘 몰라요면 왔던 길로 돌아가 그 방면으로 가도록 안내.
 */
export function transferCheckFor(nextRide: RideLeg): BoardingCheck {
  const dir = subwayDirection(nextRide);
  const target = nextRide.alightName;
  return {
    question: `${josa(q(dir), '으로', '로')} 걸어가고 있나요?`,
    lookFor: dir,
    yesLabel: '네, 맞아요',
    noLabel: '아니오 · 잘 몰라요',
    okText: '맞아요. 그대로 가세요',
    wrongTitle: goBackSentence(dir),
    wrongLines: [
      `안내판에서 ${josa(q(dir), '을', '를')} 찾아 그쪽으로 가세요`,
      `모르면 역무원에게 "${target} 가요?" 하고 물어보세요`,
    ],
  };
}

/**
 * 타기 전 확인.
 *  - 전철(2차, 승강장): "○○역 ➡ ○○역 방향이 맞나요?" (탑승역 ➡ 다음 역). 다음 역을 모르면 방면·방향 이름으로 묻습니다.
 *  - 버스: 다음 정류장을 묻지 않고, 기사님께 "○○ 방향이 맞는지" 물어보라고 안내합니다.
 */
export function boardingCheckFor(leg: RideLeg): BoardingCheck {
  const target = leg.alightName;
  if (leg.type === 'SUBWAY_LEG') {
    const dir = subwayDirection(leg);
    const next = leg.nextStation && leg.nextStation !== leg.boardName ? leg.nextStation : undefined;
    return {
      question: next
        ? `${q(stationLabel(leg.boardName))} ➡ ${q(stationLabel(next))} 방향이 맞나요?`
        : `${josa(q(dir), '이', '가')} 맞나요?`,
      lookFor: dir,
      yesLabel: '네, 맞아요',
      noLabel: '아니오 · 잘 몰라요',
      okText: '맞아요. 타세요',
      wrongTitle: goBackSentence(dir),
      wrongLines: [
        `안내판에서 ${josa(q(dir), '을', '를')} 찾아 그쪽 타는 곳으로 가세요`,
        '건너편 타는 곳이면 계단이나 승강기로 건너가요',
        `모르면 역무원에게 "${target} 가요?" 하고 물어보세요`,
      ],
    };
  }
  const dir = leg.way ? `${leg.way} 방향` : `${target} 방향`;
  return {
    question: `타기 전에 기사님께 ${josa(q(dir), '이', '가')} 맞는지 물어보세요`,
    lookFor: dir,
    yesLabel: '기사님이 맞대요',
    noLabel: '아니래요 · 잘 몰라요',
    okText: '맞아요. 타세요',
    wrongTitle: '반대쪽일 수 있어요. 타지 마세요',
    wrongLines: [
      '길 건너편 정류장에서 타야 할 수 있어요',
      `건너편 정류장에서 기사님께 "${target} 가요?" 하고 다시 물어보세요`,
    ],
  };
}

/* ── 버스 탄 뒤: 내릴 곳을 지나쳤는지 (내릴 곳에서 멀어지는지) ───────────── */

/** 기본 여유: 가장 가까웠던 거리보다 이만큼 더 멀어지면 '지나친 것 같아요' */
export const BUS_AWAY_MARGIN_M = 300;
/** 정류장 좌표가 없어 노선 모양을 모를 때 쓰는 여유 (기본보다 넉넉히) */
export const BUS_AWAY_MARGIN_UNKNOWN_M = 600;

/**
 * 버스 노선 모양에 맞춘 여유 거리를 정합니다 (경로를 고를 때 한 번 계산).
 * 빙 돌아가는 노선은 원래 길에서도 내릴 곳에서 잠깐 멀어지므로,
 * 정류장 순서대로 '내릴 곳까지 거리'를 따라가며 그때까지 가장 가까웠던 거리보다
 * 얼마나 멀어지는지(계획된 멀어짐)의 최댓값을 구해 기본 여유(300m)에 더합니다.
 *   여유 = 300m + 계획된 멀어짐 최댓값
 * 정류장 사이 굽은 길은 정류장 좌표로 알 수 없어 이 값보다 클 수 있으므로, 기본 300m를 그 몫으로 둡니다.
 */
export function busAwayMarginFor(
  stops: Array<{ lat: number; lng: number }>,
  alight: { lat: number; lng: number } | undefined,
  dist: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number,
): number {
  if (!alight || stops.length < 2) return BUS_AWAY_MARGIN_UNKNOWN_M;
  let min = Infinity;
  let plannedAway = 0;
  for (const st of stops) {
    const d = dist(st, alight);
    if (d < min) min = d;
    else plannedAway = Math.max(plannedAway, d - min);
  }
  return Math.round(BUS_AWAY_MARGIN_M + plannedAway);
}

export interface AwayTracker {
  minDistM: number | null;
  warned: boolean;
}

export const newAwayTracker = (): AwayTracker => ({ minDistM: null, warned: false });

/**
 * 거리 하나를 넣고, 새로 경고해야 하면 true.
 * 버스 길이 구불구불해 잠깐 멀어질 수 있어 여유(margin, 노선마다 busAwayMarginFor로 계산)를 둡니다. 한 구간에 한 번만 경고.
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
