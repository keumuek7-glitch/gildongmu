import type { ReactNode } from 'react';

export interface ElderLoc {
  lat: number;
  lng: number;
  t: number;
}

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 가족 화면 (임시). 지금은 연결과 어르신 소식(위치·도착)만 봅니다.
 * 약도·목적지 보내기는 다음 단계에서 기존 길동무 가족 화면을 옮겨 옵니다.
 */
export function FamilyScreen(props: { elderLoc: ElderLoc | null; news: string | null; children?: ReactNode }) {
  const loc = props.elderLoc;
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>가족 화면</h1>
      </header>

      {props.news && (
        <div className="banner banner--info" role="status">
          <p className="banner__title">{props.news}</p>
        </div>
      )}

      <div className="card">
        <p className="card__title">어르신 위치</p>
        {loc ? (
          <>
            <p className="muted">{fmtTime(loc.t)}에 받음</p>
            <a
              className="btn btn--secondary"
              href={`https://map.kakao.com/link/map/${encodeURIComponent('어르신')},${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`}
              target="_blank"
              rel="noreferrer"
            >
              카카오맵에서 위치 보기
            </a>
          </>
        ) : (
          <p className="muted">아직 받은 위치가 없어요</p>
        )}
      </div>

      {props.children}
    </main>
  );
}
