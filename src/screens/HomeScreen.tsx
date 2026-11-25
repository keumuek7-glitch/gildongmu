import { useEffect, useState, type FormEvent } from 'react';

export interface Favorite {
  id: string;
  label: string;
  name: string;
  x: number;
  y: number;
}

/** 입력칸에 미리 써 두는 곳 (즐겨찾기 또는 가족이 보낸 곳) */
export interface HomeDestination {
  label: string;
  name: string;
  x: number;
  y: number;
}

/**
 * 어르신 홈. 화면에 버튼은 늘 2개 이하입니다.
 * 평소: 글자 입력칸 + [찾기] [설정]  (입력칸은 버튼이 아니에요)
 *   입력칸에는 즐겨찾기나 가족이 보낸 곳이 미리 써 있어서, 고치지 않고 [찾기]만 눌러도 돼요.
 * 안내가 진행 중이었으면: [이어서 안내 받기] [새로 시작]
 */
export function HomeScreen(props: {
  /** 입력칸에 미리 써 둘 곳 */
  destination: HomeDestination;
  resumeAvailable: { destName: string } | null;
  /** 현재 위치를 못 잡아 다른 곳에서 출발할 때만 문구가 있음 */
  originWarning: string | null;
  notice: string | null;
  loading: boolean;
  /** loading 중에 보여 줄 한 줄 (예: "길을 찾고 있어요…") */
  loadingText: string;
  error: string | null;
  /** [찾기] (또는 키보드의 이동 키). 입력한 글자를 그대로 넘깁니다. */
  onSubmit: (text: string) => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onOpenSettings: () => void;
}) {
  const [text, setText] = useState(props.destination.name);

  // 가족이 새 목적지를 보내면 입력칸도 그 곳으로 바꿔요
  useEffect(() => {
    setText(props.destination.name);
  }, [props.destination.name]);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!props.loading) props.onSubmit(text);
  };

  return (
    <main className="screen">
      <header className="screen__header">
        <h1>어디로 가세요?</h1>
      </header>

      {props.originWarning && <p className="muted warn">{props.originWarning}</p>}
      {props.notice && <p className="status" role="status">{props.notice}</p>}

      <form className="stack" onSubmit={submit}>
        <input
          className="place-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="가고 싶은 곳을 써 주세요"
          aria-label="가고 싶은 곳"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={props.loading}
        />
        <button className="btn btn--primary" type="submit" disabled={props.loading}>찾기</button>
        <button className="btn btn--secondary" type="button" onClick={props.onOpenSettings}>⚙ 설정</button>
      </form>

      {props.loading && <p className="status" role="status">{props.loadingText}</p>}
      {props.error && <p className="status status--error" role="alert">{props.error}</p>}
    </main>
  );
}
