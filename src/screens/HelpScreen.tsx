/**
 * 도움 화면: 길 안내 중 [도움이 필요해요]를 누르면 나옵니다. 버튼은 2개.
 * 돌아가려면 폰의 뒤로 버튼을 눌러요.
 */
export function HelpScreen(props: {
  busy: boolean;
  note: string | null;
  onShareLocation: () => void;
  onReroute: () => void;
}) {
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>도움이 필요해요</h1>
        <p className="muted">돌아가려면 폰의 뒤로 버튼을 눌러요</p>
      </header>
      {props.note && <p className="status" role="status">{props.note}</p>}
      <div className="stack">
        <button className="btn btn--sos" disabled={props.busy} onClick={props.onShareLocation}>
          {props.busy ? '위치 확인 중…' : '내 위치 가족에게 보내기'}
        </button>
        <button className="btn btn--primary" onClick={props.onReroute}>지금 위치에서 길 다시 찾기</button>
      </div>
    </main>
  );
}
