import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 프론트(5173) → /api 요청은 backend-proxy(기본 8787)로 넘깁니다.
const apiPort = process.env.API_PORT ?? '8787';

/**
 * GitHub Pages는 응답 헤더를 못 바꾸므로 보안 설정(CSP)을 페이지 안 meta 태그로 넣습니다(기존 길동무와 같음).
 * 개발 서버는 인라인 스크립트를 쓰므로 빌드할 때만 넣습니다.
 */
const CSP = "default-src 'self'; script-src 'self' https://*.kakao.com https://*.daum.net https://*.daumcdn.net https://*.kakaocdn.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.kakao.com https://*.daum.net https://*.daumcdn.net https://*.kakaocdn.net; connect-src 'self' https://*.firebasedatabase.app https://*.firebaseio.com https://*.kakao.com https://*.daum.net https://*.daumcdn.net https://*.kakaocdn.net; frame-src https://*.kakao.com https://*.daum.net https://*.daumcdn.net https://*.kakaocdn.net; manifest-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'";
const cspMeta = (): Plugin => ({
  name: 'gildongmu-csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  // GitHub Pages 주소(/gildongmu/)에서 열리도록 배포 때 VITE_BASE=/gildongmu/ 로 빌드
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), cspMeta()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
