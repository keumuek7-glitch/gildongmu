import { buildTelUri } from '../core/guardian/sosMessageBuilder';

/**
 * 어르신 화면 우측 상단에 늘 떠 있는 빨간 정사각형 SOS 버튼.
 * 가족 전화번호가 있으면 전화 걸기 화면을 바로 열고, 없으면 번호를 적는 설정 화면으로 보냅니다.
 */
export function SosButton(props: { phone: string; onNoPhone: () => void }) {
  const href = buildTelUri(props.phone);
  const inner = (
    <>
      <span className="sos-fab__icon" aria-hidden="true">📞</span>
      <span className="sos-fab__text">SOS</span>
    </>
  );
  return href ? (
    <a className="sos-fab" href={href} aria-label="SOS 가족에게 전화 걸기">{inner}</a>
  ) : (
    <button type="button" className="sos-fab" onClick={props.onNoPhone} aria-label="SOS 가족 전화번호 적기">{inner}</button>
  );
}
