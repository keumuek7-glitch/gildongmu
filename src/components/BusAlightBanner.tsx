import type { AlightAlert } from '../core/navigation/proximityAlight';

/** 버스 하차 알림 (기존 길동무의 주황 화면): "다음에 내려요" / "지금 내려요" */
export function BusAlightBanner(props: {
  alert: AlightAlert;
  stopName: string;
  onAlighted: () => void;
  onDismiss: () => void;
}) {
  const now = props.alert.stage === 2;
  return (
    <div className={`bus-alight ${now ? 'bus-alight--now' : ''}`} role="alertdialog" aria-live="assertive">
      <p className="bus-alight__stop">🚌 {props.stopName}</p>
      <p className="bus-alight__msg">{props.alert.text}</p>
      <button className="btn bus-alight__btn" onClick={props.onAlighted}>내렸어요</button>
      {!now && (
        <button className="btn btn--ghost bus-alight__later" onClick={props.onDismiss}>알겠어요</button>
      )}
    </div>
  );
}
