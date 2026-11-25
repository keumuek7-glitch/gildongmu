/**
 * 화면 왼쪽 위의 작은 [← 뒤로] 버튼. 큰 버튼 개수(어르신 화면은 2개 이하)에 넣지 않는 작은 버튼입니다.
 * 전철·버스를 타고 내리는 안내 화면에서는 화살표 글자가 열차·버스 방향으로 읽힐 수 있어서
 * arrow={false} 로 "뒤로"만 씁니다(화면에 화살표 금지 규칙).
 */
export function BackButton(props: { onClick: () => void; arrow?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn--ghost back-btn back-btn--top" disabled={props.disabled} onClick={props.onClick}>
      {props.arrow === false ? '뒤로' : '← 뒤로'}
    </button>
  );
}
