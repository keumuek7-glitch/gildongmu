import { useState } from 'react';
import type { Role } from '../core/guardian/familyRelay';
import type { RelayState } from '../services/familyRelayClient';
import { sendKakao, shareResultText } from '../services/kakaoInApp';

export function pairStatusText(role: Role, paired: boolean, state: RelayState): string {
  if (!paired) {
    return role === 'child'
      ? '아직 연결 안 됨: 아래 버튼으로 어르신 폰에 연결 링크를 보내요'
      : '아직 연결 안 됨: 가족이 보낸 연결 링크를 눌러요';
  }
  if (state === 'on') return '연결됨: 메시지가 앱 안에서 오가요';
  if (state === 'error') return '연결 안 됨: 인터넷이나 서버 설정을 확인해요';
  return '연결하는 중';
}

/** 두 휴대폰 연결 상태와 버튼 (어르신·가족 공통) */
export function PairingPanel(props: {
  role: Role;
  paired: boolean;
  state: RelayState;
  /** 가족만: 연결 링크를 만들어 돌려줌 */
  onMakeLink?: () => string;
  onUnpair: () => void;
  onChangeRole: () => void;
}) {
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');

  const share = async () => {
    if (!props.onMakeLink) return;
    const url = props.onMakeLink();
    const r = await sendKakao('어르신께: 이 링크를 한 번 누르면 길동무가 가족 휴대폰과 연결돼요', url, '연결하기');
    if (r === 'fail') setLink(url);
    setNote(shareResultText(r, '어르신 대화방'));
  };

  return (
    <details className="settings" open={props.role === 'child' && !props.paired}>
      <summary>가족 휴대폰과 연결</summary>
      <p className="hint" role="status">{pairStatusText(props.role, props.paired, props.state)}</p>
      {props.role === 'child' && (
        <button className="btn btn--primary" onClick={() => void share()}>
          {props.paired ? '연결 링크 다시 보내기' : '어르신 폰과 연결하기'}
        </button>
      )}
      {note && <p className="hint">{note}</p>}
      {link && <textarea className="field" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
      {props.paired && (
        <button
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm('연결을 끊을까요? 다시 연결하려면 연결 링크를 새로 보내야 해요')) props.onUnpair();
          }}
        >
          연결 끊기
        </button>
      )}
      <button className="btn btn--ghost" onClick={props.onChangeRole}>
        {props.role === 'elder' ? '가족 화면으로 바꾸기' : '어르신 화면으로 바꾸기'}
      </button>
    </details>
  );
}
