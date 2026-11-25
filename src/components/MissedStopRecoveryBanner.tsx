import type { ReconcileWarning } from '../core/stateMachine/sessionTimeReconciler';

/**
 * 앱을 다시 열었을 때 하차 시점이 지났는지 알리는 화면. 화면 전체를 차지하고 버튼은 2개 이하.
 * "곧 내려요"는 [알겠어요] 하나, "지났을 수 있어요"는 [길 다시 찾기] [계속 안내].
 */
export function MissedStopRecoveryBanner({
  warning,
  onReroute,
  onDismiss,
}: {
  warning: ReconcileWarning;
  onReroute: () => void;
  onDismiss: () => void;
}) {
  if (warning.kind === 'NONE') return null;
  if (warning.kind === 'ALIGHT_SOON') {
    return (
      <div className="takeover takeover--alert" role="alert">
        <h1 className="takeover__title">곧 {warning.alightName}에서 내려요</h1>
        <button className="btn btn--primary" onClick={onDismiss}>알겠어요</button>
      </div>
    );
  }
  return (
    <div className="takeover takeover--warning" role="alert">
      <h1 className="takeover__title">
        내릴 곳을 지났을 수 있어요
      </h1>
      <button className="btn btn--primary" onClick={onReroute}>길 다시 찾기</button>
      <button className="btn btn--secondary" onClick={onDismiss}>계속 안내</button>
    </div>
  );
}
