import { useState } from 'react';
import type { PlaceResult } from '../services/kakaoMaps';

/**
 * 장소 고르기: 찾은 곳을 한 번에 하나씩 보여 주고 버튼은 2개.
 * 후보가 남았으면 [맞아요] [다른 곳], 마지막 후보면 [맞아요] [다시 쓰기].
 * (폰의 뒤로 버튼으로도 처음으로 돌아가요)
 */
export function PlaceConfirmScreen(props: {
  candidates: PlaceResult[];
  /** 길을 찾는 중이면 버튼을 잠그고 한 줄을 보여 줘요 */
  loading: boolean;
  onPick: (p: PlaceResult) => void;
  onBack: () => void;
}) {
  const [index, setIndex] = useState(0);
  const cur = props.candidates[index];
  const isLast = index >= props.candidates.length - 1;
  if (!cur) return null;
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>{cur.name} 맞나요?</h1>
        {cur.addr && <p className="muted">{cur.addr}</p>}
      </header>
      <div className="stack">
        <button className="btn btn--primary" disabled={props.loading} onClick={() => props.onPick(cur)}>맞아요</button>
        {isLast ? (
          <button className="btn btn--secondary" disabled={props.loading} onClick={props.onBack}>다시 쓰기</button>
        ) : (
          <button className="btn btn--secondary" disabled={props.loading} onClick={() => setIndex((i) => i + 1)}>다른 곳</button>
        )}
      </div>
      {props.loading && <p className="status" role="status">길을 찾고 있어요…</p>}
    </main>
  );
}
