import { useEffect } from 'react';
import { kakaoExternalUrl } from '../services/kakaoInApp';

/** 카톡 안 브라우저로 열렸을 때: 크롬(기본 브라우저)으로 다시 엶 */
export function LeaveKakaoScreen() {
  const go = () => { location.href = kakaoExternalUrl(location.href); };
  useEffect(() => { go(); }, []);
  return (
    <main className="screen leave-kakao">
      <h1 className="big">크롬으로 여는 중</h1>
      <p>안 열리면 오른쪽 위 ⋮ 를 눌러<br />「다른 브라우저로 열기」를 골라요</p>
      <button className="btn btn--primary" onClick={go}>크롬으로 열기</button>
    </main>
  );
}
