// 예전 길동무를 홈 화면에 설치한 휴대폰에 남아 있는 서비스 워커를 이어받는 최소 버전.
// 인터넷이 되면 늘 새 파일을 받고(네트워크 우선), 안 되면 마지막으로 받은 파일을 보여 줍니다.
const CACHE = 'gildongmu-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // 카카오·Firebase 등 외부는 그대로
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
