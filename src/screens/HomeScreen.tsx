export interface Favorite {
  id: string;
  label: string;
  name: string;
  x: number;
  y: number;
}

/** 홈의 큰 버튼 하나: 가려는 곳 */
export interface HomeDestination {
  label: string;
  name: string;
  x: number;
  y: number;
}

/**
 * 어르신 홈. 화면에 버튼은 늘 2개 이하입니다.
 * 평소: [가려는 곳] [설정]
 * 안내가 진행 중이었으면: [이어서 안내 받기] [새로 시작]
 * 가족이 목적지를 보냈으면 [가려는 곳]이 그 목적지로 바뀝니다.
 */
export function HomeScreen(props: {
  destination: HomeDestination;
  resumeAvailable: { destName: string } | null;
  /** 현재 위치를 못 잡아 다른 곳에서 출발할 때만 문구가 있음 */
  originWarning: string | null;
  notice: string | null;
  loading: boolean;
  error: string | null;
  onGo: (dest: { name: string; x: number; y: number }) => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onOpenSettings: () => void;
}) {
  if (props.resumeAvailable) {
    return (
      <main className="screen">
        <header className="screen__header">
          <h1>이어서 갈까요?</h1>
        </header>
        <div className="stack">
          <button className="btn btn--primary" onClick={props.onResume}>이어서 가기</button>
          <button className="btn btn--secondary" onClick={props.onDiscardResume}>새로 시작</button>
        </div>
      </main>
    );
  }

  const d = props.destination;
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>어디로 가세요?</h1>
      </header>

      {props.originWarning && <p className="muted warn">{props.originWarning}</p>}
      {props.notice && <p className="status" role="status">{props.notice}</p>}

      <div className="stack">
        <button className="btn btn--favorite" disabled={props.loading} onClick={() => props.onGo(d)}>
          <span className="btn__label">{d.label}</span>
        </button>
        <button className="btn btn--secondary" onClick={props.onOpenSettings}>⚙ 설정</button>
      </div>

      {props.loading && <p className="status" role="status">길을 찾고 있어요…</p>}
      {props.error && <p className="status status--error" role="alert">{props.error}</p>}
    </main>
  );
}
