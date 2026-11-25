import { useState, type ReactNode } from 'react';
import type { Role } from '../core/guardian/familyRelay';
import type { RelayState } from '../services/familyRelayClient';
import { PairingPanel } from '../components/PairingPanel';
import { getKakaoKey, setKakaoKey } from '../services/kakaoMaps';
import { STATIC_DEMO } from '../services/routeApiClient';
import { pickProvider } from '../services/routeService';
import { dailyLimit, getOdsayKey, routeCache, setOdsayKey } from '../services/routeServiceInstance';

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
  /** SOS 버튼을 눌렀는데 번호가 없을 때 안내를 띄움 */
  phoneHint?: boolean;
  onSavePhone: (phone: string) => void;
  testMode: boolean;
  onToggleTestMode: (on: boolean) => void;
  /** 어르신만: 홈에서 뺀 기능을 여기서 쓸 수 있게 */
  onShareLocation?: () => void;
  locationNote?: string | null;
  hasFamilyGuide?: boolean;
  onOpenFamilyGuide?: () => void;
  onChangeRole: () => void;
  onBack: () => void;
}) {
  const [phoneDraft, setPhoneDraft] = useState(props.guardianPhone);
  const [keyDraft, setKeyDraft] = useState(getKakaoKey);
  const [odsayDraft, setOdsayDraft] = useState(getOdsayKey);
  const [saved, setSaved] = useState('');
  const [, refresh] = useState(0);
  const elder = props.role === 'elder';

  const provider = pickProvider({ odsayKey: getOdsayKey(), staticDemo: STATIC_DEMO });
  const cacheStats = routeCache.stats();
  const ownNote = '서울 지하철만 타는 길은 앱이 직접 계산해요.';
  const routeModeNote =
    provider.id === 'sample'
      ? `${ownNote} 그 밖의 길은 시연용 샘플 길(청량리역에서 서울대병원까지)만 나와요. 키를 넣으면 진짜 길을 찾아요.`
      : provider.id === 'odsay-browser'
        ? `${ownNote} 그 밖의 길은 이 폰에서 바로 찾아요.`
        : `${ownNote} 그 밖의 길은 길 찾기 서버(프록시)로 찾아요.`;

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

      {elder && props.onShareLocation && (
        <section className="settings-block">
          <h2 className="settings-block__title">가족에게</h2>
          <button className="btn btn--secondary" onClick={props.onShareLocation}>내 위치 가족에게 보내기</button>
          {props.locationNote && <p className="hint" role="status">{props.locationNote}</p>}
          {props.hasFamilyGuide && props.onOpenFamilyGuide && (
            <button className="btn btn--secondary" onClick={props.onOpenFamilyGuide}>가족이 보낸 길 다시 보기</button>
          )}
        </section>
      )}

      {connection}

      {elder && (
        <section className="settings-block">
          <h2 className="settings-block__title">가족 전화번호 (SOS)</h2>
          {(props.phoneHint || !props.guardianPhone) && (
            <p className="hint" role="status">번호를 적고 저장하면, 화면 오른쪽 위 SOS 버튼으로 바로 전화해요</p>
          )}
          <label className="field">
            <span>SOS 버튼으로 전화할 가족 번호</span>
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
        <h2 className="settings-block__title">길 찾기 (ODsay 키)</h2>
        <p className="hint">{routeModeNote}</p>
        <label className="field">
          <span>ODsay 길 찾기 키 (이 폰에만 저장돼요)</span>
          <input value={odsayDraft} onChange={(e) => setOdsayDraft(e.target.value)} autoComplete="off" />
        </label>
        <button
          className="btn btn--secondary"
          onClick={() => {
            setOdsayKey(odsayDraft);
            setSaved('odsay');
            refresh((n) => n + 1);
          }}
        >
          저장
        </button>
        {saved === 'odsay' && (
          <p className="hint" role="status">{getOdsayKey() ? '길 찾기 키를 저장했어요' : '길 찾기 키를 지웠어요'}</p>
        )}
        <p className="hint">오늘 남은 길 찾기: {dailyLimit.remaining()}번 (하루 {dailyLimit.limit}번까지). 앱이 직접 계산한 지하철 길은 세지 않아요.</p>
        <p className="hint">지하철 시간·좌표 출처: 서울교통공사 (공공누리 1유형)</p>
        <p className="hint">
          저장해 둔 길: {routeCache.count()}곳 · 저장에서 꺼낸 횟수 {cacheStats.hit} 대 새로 찾은 횟수 {cacheStats.miss}
        </p>
        <button
          className="btn btn--ghost"
          onClick={() => {
            routeCache.clear();
            routeCache.resetStats();
            setSaved('cache');
            refresh((n) => n + 1);
          }}
        >
          저장해 둔 길 지우기
        </button>
        {saved === 'cache' && <p className="hint" role="status">저장해 둔 길을 지웠어요</p>}
      </section>

      <section className="settings-block">
        <h2 className="settings-block__title">시험용</h2>
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
