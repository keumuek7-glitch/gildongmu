/** 버스를 탄 뒤 내릴 곳을 지나친 것 같을 때: 화면 전체를 차지하고 버튼은 2개 */
export function BusAwayScreen(props: { onReroute: () => void; onDismiss: () => void }) {
  return (
    <div className="takeover takeover--warning" role="alertdialog" aria-live="assertive">
      <h1 className="takeover__title">지나친 것 같아요</h1>
      <button className="btn btn--primary" onClick={props.onReroute}>길 다시 찾기</button>
      <button className="btn btn--secondary" onClick={props.onDismiss}>괜찮아요</button>
    </div>
  );
}
