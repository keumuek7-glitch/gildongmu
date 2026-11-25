import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LeaveKakaoScreen } from './components/LeaveKakaoScreen';
import { shouldLeaveKakao } from './services/kakaoInApp';
import './styles.css';

const leave = shouldLeaveKakao(navigator.userAgent, location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {leave ? <div className="app"><LeaveKakaoScreen /></div> : <App />}
  </StrictMode>,
);

// 홈 화면 설치·오프라인용 서비스 워커 (배포된 https 주소에서만)
if (import.meta.env.PROD && !leave && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}
