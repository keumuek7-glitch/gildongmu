import { useState, type ReactNode } from 'react';
import type { Role } from '../core/guardian/familyRelay';
import type { RelayState } from '../services/familyRelayClient';
import { PairingPanel } from '../components/PairingPanel';
import { getKakaoKey, setKakaoKey } from '../services/kakaoMaps';

/**
 * 설정 화면 (어르신·가족 공통).
 * 연결, 전화번호, 카카오 키처럼 처음 한 번만 만지는 것을 홈 화면에서 치워 여기에 모았습니다.
 */
export function SettingsScreen(props: {
  role: Role;
  paired: boolean;
  relayState: RelayState;
  onMakeLink?: () => string;
  onUnpair: () => void;
  guardianPhone: string;
  onSavePhone: (phone: string) => void;
  testMode: boolean;
  onToggleTestMode: (on: boolean) => void;
  /** 샘플 길만 되는 상태일 때 보여 줄 안내 */
  demoNote?: string | null;
  onChangeRole: () => void;
  onBack: () => void;
}) {
  const [phoneDraft, setPhoneDraft] = useState(props.guardianPhone);
  const [keyDraft, setKeyDraft] = useState(getKakaoKey);
  const [saved, setSaved] = useState('');
  const elder = props.role === 'elder';

  const connection: ReactNode = (
    <PairingPanel
      role={props.role}
      paired={props.paired}
      state={props.relayState}
      onMakeLink={props.onMakeLink}
      onUnpair={props.onUnpair}
    />
  );

  return (
    <main className="screen">
      <button className="btn btn--ghost back-btn" onClick={props.onBack}>← 뒤로</button>
      <header className="screen__header">
        <h1>설정</h1>
      </header>

      {connection}

      {elder && (
        <section className="settings-block">
          <h2 className="settings-block__title">보호자 전화번호</h2>
          <label className="field">
            <span>도움이 필요할 때 위치를 보낼 번호</span>
            <input
              inputMode="tel"
              value={phoneDraft}
              placeholder="010-0000-0000"
              onChange={(e) => setPhoneDraft(e.target.value)}
            />
          </label>
          <button
            className="btn btn--secondary"
            onClick={() => {
              props.onSavePhone(phoneDraft);
              setSaved('phone');
            }}
          >
            저장
          </button>
          {saved === 'phone' && <p className="hint" role="status">저장했어요</p>}
        </section>
      )}

      <section className="settings-block">
        <h2 className="settings-block__title">로드뷰·장소 찾기 (카카오 키)</h2>
        <label className="field">
          <span>카카오 JavaScript 키</span>
          <input value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoComplete="off" />
        </label>
        <button
          className="btn btn--secondary"
          onClick={() => {
            setKakaoKey(keyDraft);
            setSaved('kakao');
          }}
        >
          저장
        </button>
        {saved === 'kakao' && <p className="hint" role="status">카카오 키를 저장했어요</p>}
      </section>

      <section className="settings-block">
        <h2 className="settings-block__title">시험용</h2>
        {props.demoNote && <p className="hint">{props.demoNote}</p>}
        <label className="check-row">
          <input
            type="checkbox"
            checked={props.testMode}
            onChange={(e) => props.onToggleTestMode(e.target.checked)}
          />
          <span>시험 버튼 보이기 (길 안내 화면 아래)</span>
        </label>
      </section>

      <section className="settings-block">
        <h2 className="settings-block__title">사용자 바꾸기</h2>
        <p className="hint">지금은 {elder ? '어르신' : '가족'} 화면이에요. 휴대폰 주인이 바뀔 때만 바꿔요.</p>
        <button
          className="btn btn--ghost"
          onClick={() => {
            const to = elder ? '가족' : '어르신';
            if (window.confirm(`${to} 화면으로 바꿀까요?`)) props.onChangeRole();
          }}
        >
          {elder ? '가족 화면으로 바꾸기' : '어르신 화면으로 바꾸기'}
        </button>
      </section>
    </main>
  );
}
