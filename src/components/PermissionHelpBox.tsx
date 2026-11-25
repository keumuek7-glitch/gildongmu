import { permissionHelp, type PermissionIssues } from '../core/permissionHelp';

/**
 * 위치·방향이 막혔을 때: 어르신에게는 한 문장만, 고치는 방법은 접힌 "가족이 고치는 방법"에.
 * 큰 버튼이 아니라서 화면의 큰 버튼 수(2개 이하)에는 들어가지 않아요.
 */
export function PermissionHelpBox(props: PermissionIssues) {
  const help = permissionHelp(props);
  if (!help) return null;
  return (
    <div className="perm-help">
      <p className="status status--error">{help.elder}</p>
      <details className="settings perm-help__family">
        <summary>가족이 고치는 방법</summary>
        <ol>
          {help.familySteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/** 지금 주소가 https(또는 내 컴퓨터)가 아니어서 위치·센서가 막히는지 */
export const isInsecurePage = (): boolean => typeof window !== 'undefined' && window.isSecureContext === false;
