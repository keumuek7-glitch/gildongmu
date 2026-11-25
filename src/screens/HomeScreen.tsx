export interface Favorite {
  id: string;
  label: string;
  name: string;
  x: number;
  y: number;
}

/**
 * 어르신 홈.
 * 평소에는 "어디로 가세요?" + 큰 버튼 몇 개만 보입니다.
 * 이어서 안내, 가족이 보낸 목적지·길 안내는 있을 때만 위에 뜹니다.
 * 연결·전화번호·카카오 키는 설정 화면으로 옮겼습니다.
 */
export function HomeScreen(props: {
  favorites: Favorite[];
  guardianDest: { name: string; x: number; y: number } | null;
  resumeAvailable: { destName: string } | null;
  /** 현재 위치를 못 잡아 다른 곳에서 출발할 때만 문구가 있음 */
  originWarning: string | null;
  notice: string | null;
  hasFamilyGuide: boolean;
  loading: boolean;
  error: string | null;
  onGo: (dest: { name: string; x: number; y: number }) => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onOpenFamilyGuide: () => void;
  onSendMyLocation: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <main className="screen">
      <div className="topbar">
        <h1 className="topbar__title">어디로 가세요?</h1>
        <button className="gear-btn" onClick={props.onOpenSettings} aria-label="설정">
          <span aria-hidden="true">⚙</span> 설정
        </button>
      </div>

      {props.originWarning && <p className="muted warn">출발: {props.originWarning}</p>}
      {props.notice && <p className="status" role="status">{props.notice}</p>}

      {props.resumeAvailable && (
        <div className="banner banner--info">
          <p className="banner__title">{props.resumeAvailable.destName} 가는 길 안내가 진행 중이었어요</p>
          <button className="btn btn--primary" onClick={props.onResume}>이어서 안내 받기</button>
          <button className="btn btn--secondary" onClick={props.onDiscardResume}>새로 시작</button>
        </div>
      )}

      {props.hasFamilyGuide && (
        <button className="btn btn--primary" onClick={props.onOpenFamilyGuide}>가족이 보낸 길 보기</button>
      )}

      {props.guardianDest && (
        <div className="banner banner--guardian">
          <p className="banner__title">가족이 보낸 목적지</p>
          <p className="big">{props.guardianDest.name}</p>
          <button className="btn btn--primary" disabled={props.loading} onClick={() => props.onGo(props.guardianDest!)}>
            이 곳으로 길 찾기
          </button>
        </div>
      )}

      <div className="stack">
        {props.favorites.map((f) => (
          <button key={f.id} className="btn btn--favorite" disabled={props.loading} onClick={() => props.onGo(f)}>
            <span className="btn__label">{f.label}</span>
            <span className="btn__sub">{f.name}</span>
          </button>
        ))}
      </div>

      {props.loading && <p className="status" role="status">길을 찾고 있어요…</p>}
      {props.error && <p className="status status--error" role="alert">{props.error}</p>}

      <button className="btn btn--secondary" onClick={props.onSendMyLocation}>내 위치 가족에게 보내기</button>
    </main>
  );
}
