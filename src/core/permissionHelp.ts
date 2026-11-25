/**
 * 위치·방향 권한이 막혔을 때의 안내 (어르신용 한 문장 + 가족이 고치는 방법).
 *
 * 어르신에게 "브라우저 설정에서 모션 센서를 허용하세요" 같은 말은 어렵습니다.
 * 그래서 어르신 화면에는 "가족에게 이 화면을 보여 주세요" 한 문장만 크게 보이고,
 * 고치는 방법은 접어 둔 칸(가족용)에 순서대로 적습니다.
 */
export interface PermissionIssues {
  /** GPS(위치)가 거절됨 */
  gps: boolean;
  /** 방향 센서가 거절됐거나 값이 오지 않음 */
  sensor: boolean;
  /** https 가 아닌 주소라서 브라우저가 위치·센서를 막는 경우 */
  insecure?: boolean;
}

export interface PermissionHelp {
  /** 어르신 화면에 크게 보일 한 문장 */
  elder: string;
  /** 가족이 읽고 따라 할 순서 */
  familySteps: string[];
}

export const APP_URL = 'https://keumuek7-glitch.github.io/gildongmu/';

export function permissionHelp(p: PermissionIssues): PermissionHelp | null {
  if (!p.gps && !p.sensor && !p.insecure) return null;
  const what = p.gps && p.sensor ? '위치와 방향을' : p.gps ? '위치를' : '방향을';
  const elder = p.insecure
    ? '이 주소에서는 위치를 못 써요. 가족에게 이 화면을 보여 주세요'
    : `폰이 ${what} 알려 주지 않아요. 가족에게 이 화면을 보여 주세요`;

  const steps: string[] = [];
  if (p.insecure) {
    steps.push(`길동무를 ${APP_URL} 주소(https)로 다시 열어 주세요. 홈 화면 아이콘도 이 주소에서 만들어 주세요`);
  }
  if (p.gps || p.insecure) {
    steps.push('폰 화면 위쪽을 아래로 내려서 "위치"가 켜져 있는지 확인해 주세요');
  }
  steps.push('크롬 주소창 왼쪽의 작은 아이콘을 누르고 "권한"(또는 "사이트 설정")에 들어가 주세요');
  if (p.gps || p.insecure) steps.push('"위치"를 "허용"으로 바꿔 주세요');
  if (p.sensor || p.insecure) steps.push('"모션 센서"를 "허용"으로 바꿔 주세요');
  steps.push('아이콘이 안 보이면: 크롬 오른쪽 위 점 세 개(⋮)를 누르고 "설정", "사이트 설정" 순서로 들어가서 같은 항목을 허용해 주세요');
  steps.push('길동무를 닫았다가 다시 열어 주세요');
  return { elder, familySteps: steps };
}
