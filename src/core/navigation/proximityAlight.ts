/**
 * 버스 좌표 하차 알림 (기존 길동무 legacy/app.js checkTrip 규칙을 옮김).
 *  - 정류장 이름이 아니라 좌표로 판단: 내릴 곳 400m 안 "다음에 내려요", 60m 안 "지금 내려요"
 *  - 400m는 임시값이라 설정으로 바꿀 수 있음(기존 저장 키 gd_alightM)
 *  - 한 번 올라간 단계는 내려가지 않음 (같은 알림 반복 방지)
 * 전철은 지하에서 GPS가 약해 이 방식 대신 정거장 상태 머신을 씁니다.
 */
import { distM, type LatLng } from './compass';

export const ALIGHT_NEAR_M_DEFAULT = 400;
export const ALIGHT_NOW_M = 60;
/** GPS 오차가 이보다 크면 '지금 내려요'를 잘못 띄울 수 있어 그 값은 건너뜀 */
export const MAX_ACCURACY_M = 150;

/** 0=아직, 1=다음에 내려요, 2=지금 내려요 */
export type AlightStage = 0 | 1 | 2;

export interface AlightAlert {
  stage: 1 | 2;
  text: string;
  vibrate: number[];
}

export function alightAlertFor(stage: 1 | 2): AlightAlert {
  return stage === 2
    ? { stage, text: '지금 내려요', vibrate: [600, 200, 600, 200, 600] }
    : { stage, text: '다음에 내려요', vibrate: [400, 200, 400] };
}

/** 거리로 다음 단계를 정합니다. 새로 올라간 단계가 있으면 alert를 돌려줍니다. */
export function nextAlightStage(
  stage: AlightStage,
  distanceM: number,
  nearM: number = ALIGHT_NEAR_M_DEFAULT,
): { stage: AlightStage; alert: AlightAlert | null } {
  if (!Number.isFinite(distanceM)) return { stage, alert: null };
  if (distanceM <= ALIGHT_NOW_M && stage < 2) return { stage: 2, alert: alightAlertFor(2) };
  if (distanceM <= Math.max(nearM, ALIGHT_NOW_M) && stage < 1) return { stage: 1, alert: alightAlertFor(1) };
  return { stage, alert: null };
}

/** GPS 한 번 읽은 값으로 단계 계산 (오차가 크면 무시) */
export function stageFromFix(
  stage: AlightStage,
  pos: LatLng,
  target: LatLng,
  opts: { accuracyM?: number; nearM?: number } = {},
): { stage: AlightStage; alert: AlightAlert | null; distanceM: number | null } {
  if (opts.accuracyM != null && opts.accuracyM > MAX_ACCURACY_M) return { stage, alert: null, distanceM: null };
  const d = distM(pos, target);
  return { ...nextAlightStage(stage, d, opts.nearM), distanceM: d };
}

/** 설정값 정리: 100~1500m, 숫자가 아니면 기본값 */
export function sanitizeNearM(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return ALIGHT_NEAR_M_DEFAULT;
  return Math.min(1500, Math.max(100, Math.round(n)));
}
