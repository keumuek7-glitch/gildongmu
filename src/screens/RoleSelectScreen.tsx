import type { Role } from '../core/guardian/familyRelay';

/** 처음 열 때: 누가 쓰나요? (기존 길동무와 같은 첫 화면) */
export function RoleSelectScreen(props: { onPick: (r: Role) => void }) {
  return (
    <main className="screen">
      <header className="screen__header">
        <h1>누가 쓰나요?</h1>
      </header>
      <div className="stack">
        <button className="btn btn--primary" onClick={() => props.onPick('elder')}>어르신</button>
        <button className="btn btn--secondary" onClick={() => props.onPick('child')}>가족 (자녀)</button>
      </div>
    </main>
  );
}
