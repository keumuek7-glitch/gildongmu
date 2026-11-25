import { josa } from '../core/safety/directionCheck';

/** 버스를 탄 뒤 내릴 곳을 지나친 것 같을 때: 화면 전체를 차지하고 버튼은 2개 */
export function BusAwayScreen(props: { stopName: string; onReroute: () => void; onDismiss: () => void }) {
  return (
    <div className="takeover takeover--warning" role="alertdialog" aria-live="assertive">
      <h1 className="takeover__title">지나친 것 같아요</h1>
      <p className="takeover__text">
        {josa(props.stopName, '을', '를')} 지나쳐 멀어지고 있어요. 다음 정류장에서 내려서 길을 다시 찾아요.
      </p>
      <button className="btn btn--primary" onClick={props.onReroute}>지금 위치에서 길 다시 찾기</button>
      <button className="btn btn--secondary" onClick={props.onDismiss}>괜찮아요, 맞게 가고 있어요</button>
    </div>
  );
}
