'use strict';
/* 길동무 A 버전 (시제품)
 * - 어르신 화면과 가족(자녀) 화면이 한 앱 안에 있습니다.
 * - 두 화면 사이 연결(Link)은 지금은 같은 휴대폰/브라우저 안에서만 됩니다 (시험용).
 *   실제 두 휴대폰 사이 연결은 서버가 필요합니다 (다음 단계).
 * - 카카오 키는 코드에 넣지 않습니다. 설정 화면에서 넣으면 이 휴대폰에만 저장됩니다.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- 저장 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('gd_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gd_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('gd_' + k); } catch (e) {} },
};

/* ---------- 거리·방향 계산 ---------- */
const EARTH = 6371000;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
function distM(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}
function bearingDeg(a, b) {
  const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const norm180 = a => ((a % 360) + 540) % 360 - 180;
const norm360 = a => ((a % 360) + 360) % 360;
function toXY(o, p) { // 미터, x=동쪽, y=북쪽
  return { x: rad(p.lng - o.lng) * EARTH * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * EARTH };
}
const lerpPt = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
function josa(word, withBatchim, without) { // 받침 있으면 앞, 없으면 뒤
  const c = (word || '').charCodeAt((word || '').length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) return word + (((c - 0xAC00) % 28) ? withBatchim : without);
  return word + without;
}
function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m / 10) * 10 + 'm'; }
function fmtTime(t) { const d = new Date(t); return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

/* ---------- 시험용 경로 (좌표는 가짜, 실제 위치 아님) ---------- */
const SAMPLE_TRIP = {
  sample: true,
  from: { name: '미금역 1번 출구', lat: 37.3500, lng: 127.1090 },
  stop: { name: '아름마을', lat: 37.3640, lng: 127.1240 },
  dest: { name: '아름마을', lat: 37.3652, lng: 127.1262 },
};

/* ---------- 두 화면 연결 (시험용: 같은 기기 안) ---------- */
const Link = (() => {
  let ch = null;
  try { ch = new BroadcastChannel('gildongmu'); } catch (e) {}
  const handlers = [];
  const deliver = m => handlers.forEach(h => { try { h(m); } catch (e) { console.error(e); } });
  if (ch) ch.onmessage = e => deliver(e.data);
  else window.addEventListener('storage', e => {
    if (e.key === 'gd_msg' && e.newValue) { try { deliver(JSON.parse(e.newValue)); } catch (err) {} }
  });
  return {
    send(type, data) {
      const m = { type, data, t: Date.now() };
      store.set('last_' + type, m);
      if (ch) ch.postMessage(m); else store.set('msg', m);
    },
    on(h) { handlers.push(h); },
    last(type) { return store.get('last_' + type, null); },
  };
})();

/* ---------- 설정 ---------- */
const params = new URLSearchParams(location.search);
const S = {
  role: params.get('role') || store.get('role', null),
  elderName: store.get('elderName', '어머니'),
  elderPhone: store.get('elderPhone', ''),
  familyPhone: store.get('familyPhone', ''),
  kakaoKey: store.get('kakaoKey', ''),
  alightM: store.get('alightM', 400),
  test: params.get('test') === '1' || store.get('test', false),
};

/* ---------- 공통 화면 전환 ---------- */
let current = null, prevScreen = null;
const onShow = {};
/* 뒤로 가기: 첫 화면(어르신 대기·가족 지도·처음 고르기·동의)은 바닥(0단계),
 * 나머지 화면은 휴대폰 뒤로 버튼으로 한 단계씩 돌아갑니다. */
const BASE_SCREENS = ['s-role', 's-consent', 's-ehome', 's-cmap'];
let navDepth = 0;
function homeScreen() { return S.role === 'elder' ? 's-ehome' : S.role === 'child' ? 's-cmap' : 's-role'; }
function show(id, fromPop) {
  if (current === id) return;
  if (!fromPop) {
    try {
      if (BASE_SCREENS.includes(id)) {
        if (navDepth > 0) { const d = navDepth; navDepth = 0; pendingHome = id; history.go(-d); }
        else history.replaceState({ s: id, d: 0 }, '');
      } else {
        navDepth += 1;
        history.pushState({ s: id, d: navDepth }, '');
      }
    } catch (e) {}
  }
  if (current && current !== 's-settings') prevScreen = current;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  current = id;
  window.scrollTo(0, 0);
  if (onShow[id]) onShow[id]();
}
let pendingHome = null;
window.addEventListener('popstate', e => {
  const st = e.state || {};
  navDepth = st.d || 0;
  let id;
  if (navDepth === 0) {
    // 바닥으로 돌아옴: 앱이 일부러 바닥 화면으로 보낸 경우 그 화면, 아니면 첫 화면
    id = pendingHome || (current && BASE_SCREENS.includes(current) ? current : homeScreen());
    pendingHome = null;
    try { history.replaceState({ s: id, d: 0 }, ''); } catch (err) {}
  } else {
    id = st.s && document.getElementById(st.s) ? st.s : homeScreen();
  }
  show(id, true);
});
function goBack() {
  if (navDepth > 0) history.back();
  else show(homeScreen());
}
let bannerTimer = null;
function banner(text, ms = 4000) {
  const b = $('#banner');
  b.textContent = text; b.hidden = false;
  b.classList.toggle('top', current === 's-settings');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function buzz(p = [300, 150, 300]) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}
function applyNames() {
  $$('.elder-name').forEach(e => { e.textContent = S.elderName || '어르신'; });
  $$('[data-call]').forEach(a => { if (S.familyPhone) a.href = 'tel:' + S.familyPhone; else a.removeAttribute('href'); });
  $$('[data-call-elder]').forEach(a => { if (S.elderPhone) a.href = 'tel:' + S.elderPhone; else a.removeAttribute('href'); });
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) { show(go.dataset.go); return; }
  if (e.target.closest('[data-back]')) { goBack(); return; }
  const call = e.target.closest('[data-call],[data-call-elder]');
  if (call && !call.getAttribute('href')) {
    e.preventDefault();
    // 번호가 없으면 바로 설정 화면의 전화번호 칸으로
    const forElder = call.hasAttribute('data-call');
    show('s-settings');
    const f = $(forElder ? '#set-family-phone' : '#set-elder-phone');
    f.classList.add('need');
    setTimeout(() => { f.scrollIntoView({ block: 'center' }); f.focus(); }, 50);
    banner((forElder ? '가족' : '어르신') + ' 전화번호를 넣고 저장을 눌러요', 5000);
  }
});

/* ---------- 카카오 지도 (키가 있을 때만) ---------- */
/* 보안 설정(CSP)에 막힌 주소를 기록: 로드뷰가 안 뜰 때 화면에 이유로 보여 줌 */
const blocked = [];
document.addEventListener('securitypolicyviolation', e => {
  try { const u = new URL(e.blockedURI); if (!blocked.includes(u.host)) blocked.push(u.host); }
  catch (err) { if (e.blockedURI && !blocked.includes(e.blockedURI)) blocked.push(e.blockedURI); }
});
const Kakao = {
  state: 'none', // none | loading | ready | failed
  why: '',
  _p: null,
  load() {
    if (!S.kakaoKey) { this.state = 'none'; return Promise.reject(new Error('nokey')); }
    if (this._p) return this._p;
    this.state = 'loading';
    this._p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.state = 'failed'; this.why = 'timeout'; reject(new Error('timeout')); }, 15000);
      const ok = () => { clearTimeout(timer); this.state = 'ready'; resolve(); };
      const bad = why => { clearTimeout(timer); this.state = 'failed'; this.why = why; reject(new Error(why)); };
      const s = document.createElement('script');
      s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(S.kakaoKey) + '&autoload=false&libraries=services';
      s.onload = () => {
        // 키가 틀렸거나 등록한 웹 도메인이 다르면 kakao 객체가 없거나 load가 끝나지 않음
        if (!window.kakao || !kakao.maps || !kakao.maps.load) return bad('sdk');
        try { kakao.maps.load(ok); } catch (e) { bad('sdk'); }
      };
      s.onerror = () => bad('load');
      document.head.appendChild(s);
    });
    this._p.catch(() => { this._p = null; });
    return this._p;
  },
  ready() { return this.state === 'ready' && window.kakao && kakao.maps; },
  /* 가장 가까운 로드뷰를 그 자리·방향으로 띄움. 결과: rv 객체 또는 null */
  roadview(el, pos, pan) {
    return new Promise(resolve => {
      if (!this.ready()) return resolve(null);
      let done = false;
      const finish = (rv, why) => { if (done) return; done = true; clearTimeout(t); this.rvWhy = why || ''; resolve(rv); };
      const t = setTimeout(() => finish(null, 'rvtimeout'), 12000);
      try {
        el.innerHTML = '';
        const rv = new kakao.maps.Roadview(el);
        const rc = new kakao.maps.RoadviewClient();
        const p = new kakao.maps.LatLng(pos.lat, pos.lng);
        rc.getNearestPanoId(p, 100, id => {
          if (id === null) return finish(null, 'nopano');
          kakao.maps.event.addListener(rv, 'init', () => {
            rv.setViewpoint({ pan: pan, tilt: 0, zoom: 0 });
            finish(rv);
          });
          rv.setPanoId(id, p);
        });
      } catch (e) { finish(null, 'error'); }
    });
  },
  rvWhy: '',
  /* 로드뷰가 안 뜬 이유를 한 줄로 */
  reason() {
    let r;
    if (!S.kakaoKey) r = '카카오 키가 없어요. 설정에서 키를 넣어 주세요';
    else if (this.state === 'failed') r = this.why === 'timeout' ? '카카오 지도를 불러오지 못했어요 (시간 초과)'
      : '카카오 지도를 불러오지 못했어요. 키 또는 카카오에 등록한 웹 주소를 확인해 주세요';
    else if (this.rvWhy === 'nopano') r = '이 자리 100m 안에는 로드뷰가 없어요';
    else if (this.rvWhy === 'rvtimeout') r = '로드뷰를 불러오지 못했어요 (시간 초과)';
    else if (this.rvWhy === 'error') r = '로드뷰를 여는 중 오류가 났어요';
    else r = '로드뷰를 불러오지 못했어요';
    if (blocked.length) r += ' · 막힌 주소: ' + blocked.join(', ');
    return r;
  },
  search(q) {
    return new Promise(resolve => {
      if (!this.ready()) return resolve(null);
      const ps = new kakao.maps.services.Places();
      ps.keywordSearch(q, (data, status) => {
        if (status !== kakao.maps.services.Status.OK) return resolve([]);
        resolve(data.slice(0, 10).map(d => ({ name: d.place_name, addr: d.road_address_name || d.address_name, lat: +d.y, lng: +d.x })));
      });
    });
  },
};

/* ======================================================
 *  어르신
 * ====================================================== */
const E = {
  pos: null, acc: null, heading: null, gpsWatch: null,
  sharing: store.get('sharing', false),
  trip: null, guide: null,
  alightDone: false, alightStage: 0, arrived: false,
  simT: 0, simHead: 0,
  lastSent: 0,
};

function elderUseSim() { return S.test && !$('#tp-gps').checked; }

let incomingGuide = false;
function readIncoming() {
  const raw = params.get('go');
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    if (!d || !d.g || !isFinite(d.g.lat) || !isFinite(d.g.lng)) return;
    const g = { lat: +d.g.lat, lng: +d.g.lng, pan: +d.g.pan || 0, phrase: String(d.g.phrase || '곧장 가요').slice(0, 20), t: Date.now() };
    store.set('last_guide', { type: 'guide', data: g, t: g.t });
    if (d.trip && d.trip.dest) {
      const ok = o => o && isFinite(o.lat) && isFinite(o.lng) ? { name: String(o.name || '').slice(0, 30), lat: +o.lat, lng: +o.lng } : null;
      store.set('last_trip', { type: 'trip', data: { from: null, stop: ok(d.trip.stop), dest: ok(d.trip.dest) }, t: g.t });
      store.set('alightDone', false);
    }
    incomingGuide = true;
    // 다시 열 때 또 뜨지 않게 주소에서 지움
    history.replaceState(history.state, '', location.pathname + '?role=elder');
  } catch (e) {}
}
function elderHome() {
  show('s-ehome');
  if (incomingGuide && E.guide) { incomingGuide = false; show('s-guide'); }
}
function elderStart() {
  readIncoming();
  E.trip = (Link.last('trip') || {}).data || null;
  const g = Link.last('guide');
  E.guide = g ? g.data : null;
  E.alightDone = store.get('alightDone', false);
  if (!store.get('consent', false)) { show('s-consent'); return; }
  startSensors();
  elderHome();
}

$('#consent-yes').onclick = async () => {
  store.set('consent', true);
  store.set('consentAt', Date.now());
  E.sharing = true; store.set('sharing', true);
  await askOrientationPermission();
  startSensors();
  elderHome();
  banner('가족에게 위치를 보내기 시작했어요');
};
$('#consent-no').onclick = () => {
  store.set('consent', true);
  E.sharing = false; store.set('sharing', false);
  startSensors();
  show('s-ehome');
};

onShow['s-ehome'] = () => {
  const pill = $('#share-pill');
  pill.classList.toggle('off', !E.sharing);
  $('#share-text').textContent = E.sharing ? '가족에게 위치 보내는 중' : '위치 보내기 꺼짐';
  const hasTrip = !!(E.trip && E.trip.dest);
  $('#ehome-dest').hidden = !hasTrip;
  if (hasTrip) $('#ehome-dest').textContent = E.trip.dest.name;
  $('#ehome-title').textContent = hasTrip ? '나침반을 눌러요' : '가족이 길을 보내면 여기 떠요';
  $('#ehome-compass').hidden = !hasTrip;
  keepAwake(E.sharing);
};
$('#ehome-compass').onclick = () => show('s-compass');

/* --- 받은 로드뷰 --- */
onShow['s-guide'] = async () => {
  const g = E.guide;
  if (!g) { show('s-ehome'); return; }
  $('#guide-phrase').textContent = g.phrase;
  const box = $('#rv-elder');
  const note = $('#rv-elder-fallback .rv-note');
  box.classList.remove('has-rv');
  note.textContent = '로드뷰 불러오는 중';
  try { await Kakao.load(); } catch (e) {}
  let rv = null;
  if (Kakao.ready()) {
    let holder = $('#rv-elder-holder');
    if (!holder) { holder = document.createElement('div'); holder.id = 'rv-elder-holder'; box.prepend(holder); }
    rv = await Kakao.roadview(holder, g, g.pan);
    if (rv) box.classList.add('has-rv');
  }
  if (!rv) note.textContent = Kakao.reason();
  // 로드뷰가 없을 때: 큰 화살표만 (방향은 나침반에서)
};
$('#guide-speak').onclick = () => { if (E.guide) speak(E.guide.phrase); };
$('#guide-compass').onclick = () => show('s-compass');

/* --- 나침반 --- */
const ALIGN_DEG = 20;
let cmpRAF = null, alignedState = null;
function compassTarget() {
  if (!E.trip) return null;
  if (E.alightDone || !E.trip.stop) return E.trip.dest;
  return E.trip.dest; // 목적지는 늘 위 (시안 기준). 직선 방향이라 실제 길과 다를 수 있음.
}
function buildNSEW(g, cx, cy, r, upBearing) {
  const names = [['북', 0], ['동', 90], ['남', 180], ['서', 270]];
  g.innerHTML = names.map(([n, d]) => {
    const a = rad(d - upBearing);
    return `<text x="${(cx + r * Math.sin(a)).toFixed(1)}" y="${(cy - r * Math.cos(a)).toFixed(1)}">${n}</text>`;
  }).join('');
}
onShow['s-compass'] = () => {
  const t = compassTarget();
  if (!t) { show('s-ehome'); return; }
  $('#cmp-dest').textContent = t.name;
  alignedState = null;
  keepAwake(true);
  if (!E.heading && !elderUseSim() && needsOrientationPermission()) $('#cmp-permit').hidden = false;
  cancelAnimationFrame(cmpRAF);
  const loop = () => { if (current !== 's-compass') return; drawCompass(); cmpRAF = requestAnimationFrame(loop); };
  loop();
};
$('#cmp-permit').onclick = async () => { await askOrientationPermission(); $('#cmp-permit').hidden = true; };
$('#cmp-rv').onclick = () => { if (E.guide) show('s-guide'); else banner('가족이 보낸 로드뷰가 아직 없어요'); };
$('#cmp-done').onclick = () => elderArrive();

function drawCompass() {
  const t = compassTarget();
  const msg = $('#cmp-msg');
  const sec = $('#s-compass');
  if (!E.pos || E.heading == null) {
    msg.textContent = !E.pos ? '내 위치를 찾는 중' : '방향을 찾는 중';
    sec.classList.remove('aligned');
    $('#cmp-arrow').setAttribute('transform', '');
    return;
  }
  const b = bearingDeg(E.pos, t);
  const r = norm180(b - E.heading); // +면 목적지가 오른쪽
  buildNSEW($('#cmp-nsew'), 175, 205, 165, b);
  $('#cmp-arrow').setAttribute('transform', `rotate(${(-r).toFixed(1)} 175 380)`);
  const aligned = Math.abs(r) <= ALIGN_DEG;
  sec.classList.toggle('aligned', aligned);
  const text = aligned ? '이쪽이에요' : (r > 0 ? '오른쪽으로 돌아요' : '왼쪽으로 돌아요');
  if (msg.textContent !== text) msg.textContent = text;
  if (aligned !== alignedState) {
    if (aligned && alignedState !== null) { buzz([120]); }
    alignedState = aligned;
  }
}

/* --- 하차·도착 확인 (정류장 이름이 아니라 좌표로 판단) --- */
function checkTrip() {
  if (!E.trip || !E.pos) return;
  const { stop, dest } = E.trip;
  if (stop && !E.alightDone) {
    const d = distM(E.pos, stop);
    if (d <= 60 && E.alightStage < 2) {
      E.alightStage = 2; showAlight('지금 내려요', true);
    } else if (d <= S.alightM && E.alightStage < 1) {
      E.alightStage = 1; showAlight('다음에 내려요', false);
    }
  }
  if (dest && !E.arrived && (E.alightDone || !stop)) {
    if (distM(E.pos, dest) <= 30) elderArrive();
  }
}
function showAlight(text, now) {
  $('#alight-stop').textContent = E.trip.stop.name;
  $('#alight-msg').textContent = text;
  $('#s-alight').classList.toggle('now', now);
  show('s-alight');
  speak(text);
  buzz(now ? [600, 200, 600, 200, 600] : [400, 200, 400]);
}
$('#alight-done').onclick = () => {
  E.alightDone = true; store.set('alightDone', true);
  Link.send('alighted', { t: Date.now() });
  show('s-compass');
};
function elderArrive() {
  E.arrived = true;
  show('s-arrive');
  buzz([200]);
}
$('#arrive-tell').onclick = () => {
  Link.send('arrived', { name: E.trip && E.trip.dest ? E.trip.dest.name : '' });
  banner('가족에게 알렸어요');
};
$('#arrive-home').onclick = () => show('s-ehome');

/* --- 센서 --- */
function needsOrientationPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}
async function askOrientationPermission() {
  if (!needsOrientationPermission()) return;
  try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
}
let headSin = 0, headCos = 0, headInit = false, sensorsOn = false;
function onOrientation(e) {
  if (elderUseSim()) return;
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
  else if (e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  h = norm360(h + so);
  const s = Math.sin(rad(h)), c = Math.cos(rad(h));
  if (!headInit) { headSin = s; headCos = c; headInit = true; }
  else { headSin = headSin * 0.8 + s * 0.2; headCos = headCos * 0.8 + c * 0.2; }
  E.heading = norm360(deg(Math.atan2(headSin, headCos)));
}
function startSensors() {
  if (sensorsOn) return;
  sensorsOn = true;
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrientation);
  else window.addEventListener('deviceorientation', onOrientation);
  startGps();
  setInterval(elderTick, 1000);
}
function startGps() {
  if (E.gpsWatch != null || !('geolocation' in navigator)) return;
  E.gpsWatch = navigator.geolocation.watchPosition(p => {
    if (elderUseSim()) return;
    E.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    E.acc = p.coords.accuracy;
    onElderPos();
  }, err => {
    if (!elderUseSim() && err.code === 1) banner('위치 권한을 켜 주세요', 6000);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function onElderPos() {
  checkTrip();
  sendElderLoc(false);
}
function sendElderLoc(force) {
  if (!E.sharing || !E.pos) return;
  const now = Date.now();
  if (!force && now - E.lastSent < 3000) return;
  E.lastSent = now;
  Link.send('elderLoc', { lat: E.pos.lat, lng: E.pos.lng, acc: E.acc, heading: E.heading, t: now });
}
function elderTick() {
  if (elderUseSim()) simApply();
  sendElderLoc(false);
}

/* --- 시험 모드: 가짜 위치·방향 --- */
function simRoute() {
  const t = E.trip && E.trip.dest ? E.trip : SAMPLE_TRIP;
  const from = t.from && t.from.lat != null ? t.from : SAMPLE_TRIP.from;
  const pts = [from, t.stop || t.dest, t.dest];
  return pts;
}
function simApply() {
  const pts = simRoute();
  const T = E.simT;
  const pos = T <= 0.8 ? lerpPt(pts[0], pts[1], T / 0.8) : lerpPt(pts[1], pts[2], (T - 0.8) / 0.2);
  E.pos = pos; E.acc = 5; E.heading = E.simHead;
  onElderPos();
}
function setupTestPanel() {
  const tp = $('#testpanel');
  tp.hidden = !S.test || S.role !== 'elder';
  if (tp.hidden) return;
  $('#tp-toggle').onclick = () => { $('#tp-body').hidden = !$('#tp-body').hidden; };
  $('#tp-pos').oninput = e => {
    E.simT = +e.target.value / 1000;
    const pts = simRoute();
    const label = E.simT < 0.05 ? '출발' : E.simT < 0.8 ? '버스 ' + fmtDist(distM(lerpPt(pts[0], pts[1], E.simT / 0.8), pts[1])) : '걷기';
    $('#tp-pos-label').textContent = label;
    if (elderUseSim()) simApply();
  };
  $('#tp-head').oninput = e => {
    E.simHead = +e.target.value; $('#tp-head-label').textContent = E.simHead + '°';
    if (elderUseSim()) E.heading = E.simHead;
  };
  $('#tp-gps').onchange = () => { if (!elderUseSim()) { E.pos = null; E.heading = null; headInit = false; } };
}

/* --- 가족이 보낸 것 받기 --- */
function elderOnMessage(m) {
  if (m.type === 'trip') {
    E.trip = m.data; E.alightDone = false; E.alightStage = 0; E.arrived = false;
    store.set('alightDone', false);
    if (current === 's-ehome') onShow['s-ehome']();
  } else if (m.type === 'guide') {
    E.guide = m.data;
    if (current === 's-guide') { current = null; }
    show('s-guide');
    buzz([300]);
    speak(m.data.phrase);
  } else if (m.type === 'viewed') {
    if (E.sharing) banner('가족이 내 위치를 봤어요 · ' + fmtTime(m.t), 5000);
  } else if (m.type === 'tripReset') {
    E.trip = null;
    if (current === 's-ehome') onShow['s-ehome']();
  }
}

/* ======================================================
 *  가족 (자녀)
 * ====================================================== */
const C = {
  trip: { from: null, stop: null, dest: null },
  elder: null,
  pan: 0, rv: null,
  phrase: '곧장 가요',
};

function childStart() {
  const t = Link.last('trip');
  if (t && t.data) C.trip = Object.assign({ from: null, stop: null, dest: null }, t.data);
  const l = Link.last('elderLoc');
  if (l) C.elder = l.data;
  fillFields();
  show('s-cmap');
  Kakao.load().catch(() => {});
}
function fillFields() {
  const set = (id, p) => { const i = $(id); i.value = p ? p.name : ''; i.classList.toggle('picked', !!(p && p.lat != null)); };
  set('#f-from', C.trip.from); set('#f-stop', C.trip.stop); set('#f-to', C.trip.dest);
  $('#coord-note').textContent = C.trip.sample ? '예시 경로의 좌표는 시험용이에요 (실제 위치 아님)' : '';
}
function pushTrip() {
  Link.send('trip', C.trip);
  drawChildMap();
}

onShow['s-cmap'] = () => {
  Link.send('viewed', {});
  drawChildMap();
};

/* 입력칸 */
const FIELD = { from: '#f-from', stop: '#f-stop', to: '#f-to' };
const KEY = { from: 'from', stop: 'stop', to: 'dest' };
$$('[data-clear]').forEach(b => b.onclick = () => {
  const f = b.dataset.clear;
  $(FIELD[f]).value = '';
  C.trip[KEY[f]] = null; C.trip.sample = false;
  fillFields(); pushTrip();
  $(FIELD[f]).focus();
});
$('#trip-reset').onclick = () => {
  C.trip = { from: null, stop: null, dest: null };
  fillFields(); Link.send('tripReset', {}); Link.send('trip', C.trip); drawChildMap();
  $('#search-results').hidden = true;
};
$('#trip-sample').onclick = () => {
  C.trip = JSON.parse(JSON.stringify(SAMPLE_TRIP));
  fillFields(); pushTrip();
  banner('예시 경로를 넣었어요 (시험용 좌표)');
};
let searchFor = null;
Object.keys(FIELD).forEach(f => {
  const input = $(FIELD[f]);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(f); } });
  input.addEventListener('change', () => doSearch(f));
});
async function doSearch(f) {
  const q = $(FIELD[f]).value.trim();
  const box = $('#search-results');
  if (!q) return;
  const cur = C.trip[KEY[f]];
  if (cur && cur.name === q && cur.lat != null) return;
  try { await Kakao.load(); } catch (e) {}
  if (!Kakao.ready()) {
    C.trip[KEY[f]] = { name: q, lat: null, lng: null };
    C.trip.sample = false;
    fillFields(); pushTrip();
    banner(S.kakaoKey ? '카카오 지도를 못 불러왔어요 (키·도메인 확인)' : '장소 찾기는 카카오 키를 넣으면 돼요', 5000);
    return;
  }
  const list = await Kakao.search(q);
  searchFor = f;
  if (!list || !list.length) { box.innerHTML = '<button disabled>찾는 곳이 없어요</button>'; box.hidden = false; return; }
  box.innerHTML = list.map((p, i) => `<button data-i="${i}">${escapeHtml(p.name)}<small>${escapeHtml(p.addr || '')}</small></button>`).join('');
  box.hidden = false;
  $$('button', box).forEach(btn => btn.onclick = () => {
    const p = list[+btn.dataset.i];
    C.trip[KEY[searchFor]] = p; C.trip.sample = false;
    box.hidden = true; fillFields(); pushTrip();
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* 목적지가 늘 위로 오게 돌린 약도 */
function drawChildMap() {
  const svg = $('#cmap-svg');
  const box = $('#cmap-box');
  const upd = $('#cmap-updated');
  const el = C.elder, dest = C.trip.dest;
  if (el) {
    const age = (Date.now() - el.t) / 1000;
    upd.textContent = fmtTime(el.t) + ' 갱신' + (age > 60 ? ' (오래됨)' : '');
    upd.classList.toggle('stale', age > 60);
  }
  const ok = el && dest && dest.lat != null;
  $('#cmap-empty').hidden = !!ok;
  $('#cmap-send').disabled = !el;
  if (!ok) { svg.innerHTML = ''; return; }
  const W = 350, H = Math.max(260, Math.round(box.clientHeight / box.clientWidth * W) || 300);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const b = bearingDeg(el, dest);
  const d = distM(el, dest);
  const ex = W / 2, ey = H - 52, top = 46;
  const scale = (ey - top) / Math.max(d, 1);
  const proj = p => { // 목적지 방향이 위가 되도록 회전
    const v = toXY(el, p);
    const s = Math.sin(rad(b)), c = Math.cos(rad(b));
    const up = v.x * s + v.y * c, right = v.x * c - v.y * s;
    return { x: ex + right * scale, y: ey - up * scale };
  };
  let extra = '';
  const stop = C.trip.stop;
  if (stop && stop.lat != null && !(Link.last('alighted') && Link.last('alighted').t > (Link.last('trip') || { t: 0 }).t)) {
    const sp = proj(stop);
    if (sp.y > 10 && sp.y < H - 10 && sp.x > 10 && sp.x < W - 10) {
      extra += `<circle cx="${sp.x.toFixed(1)}" cy="${sp.y.toFixed(1)}" r="9" fill="#C2410C" stroke="#fff" stroke-width="3"/>`
        + `<text x="${(sp.x + 14).toFixed(1)}" y="${(sp.y + 5).toFixed(1)}" class="map-label" fill="#9A3412">내릴 곳</text>`;
    }
  }
  // 북쪽 표시
  const na = rad(-b);
  const nx = W - 30, ny = 30;
  extra += `<g opacity="0.7"><circle cx="${nx}" cy="${ny}" r="18" fill="#fff" stroke="#bbb"/><path d="M${nx} ${ny} L ${(nx + 13 * Math.sin(na)).toFixed(1)} ${(ny - 13 * Math.cos(na)).toFixed(1)}" stroke="#777" stroke-width="3" stroke-linecap="round"/><text x="${(nx + 26 * Math.sin(na)).toFixed(1)}" y="${(ny - 26 * Math.cos(na) + 5).toFixed(1)}" font-size="13" font-weight="700" fill="#777" text-anchor="middle">북</text></g>`;
  // 어르신이 보는 쪽
  let cone = '';
  if (el.heading != null) {
    const ha = norm180(el.heading - b);
    cone = `<path d="M${ex} ${ey} L ${ex - 16} ${ey - 46} A 48 48 0 0 1 ${ex + 16} ${ey - 46} Z" fill="#1546C8" opacity="0.22" transform="rotate(${ha.toFixed(1)} ${ex} ${ey})"/>`;
  }
  svg.innerHTML = `
    ${cone}
    <path class="blink" d="M${ex} ${ey - 26} L ${ex} ${top + 26}" stroke="#1546C8" stroke-width="8" stroke-dasharray="14 10" stroke-linecap="round" fill="none"/>
    <path class="blink" d="M${ex - 20} ${top + 46} L ${ex} ${top + 18} L ${ex + 20} ${top + 46}" stroke="#1546C8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    ${extra}
    <g><rect x="${ex - 70}" y="6" width="140" height="32" rx="8" fill="#15803D"/><text x="${ex}" y="28" text-anchor="middle" fill="#fff" font-size="18" font-weight="900">${escapeHtml(dest.name.slice(0, 8))}</text></g>
    <text x="${ex + 14}" y="${(ey + top) / 2}" font-size="16" font-weight="700" fill="#333">${fmtDist(d)}</text>
    <circle cx="${ex}" cy="${ey}" r="16" fill="#1546C8" stroke="#fff" stroke-width="5"/>
    <g><rect x="${ex - 40}" y="${ey + 20}" width="80" height="26" rx="8" fill="#111"/><text x="${ex}" y="${ey + 39}" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">${escapeHtml((S.elderName || '어르신').slice(0, 5))}</text></g>`;
}
setInterval(() => { if (S.role === 'child' && current === 's-cmap') drawChildMap(); }, 10000);

/* 방향 고르기 */
$('#cmap-send').onclick = () => { if (C.elder) show('s-cdir'); else banner('어르신 위치를 아직 못 받았어요'); };
function destBearing() {
  const dest = C.trip.dest;
  if (C.elder && dest && dest.lat != null) return Math.round(bearingDeg(C.elder, dest));
  return C.elder && C.elder.heading != null ? Math.round(C.elder.heading) : 0;
}
onShow['s-cdir'] = async () => {
  C.pan = destBearing();
  const box = $('#rv-child');
  box.classList.remove('has-rv');
  $('#dial-controls').hidden = false;
  drawDial();
  $('#rv-child-note').textContent = '로드뷰 불러오는 중';
  try { await Kakao.load(); } catch (e) {}
  C.rv = null;
  if (Kakao.ready() && C.elder) {
    let holder = $('#rv-child-holder');
    if (!holder) { holder = document.createElement('div'); holder.id = 'rv-child-holder'; box.prepend(holder); }
    C.rv = await Kakao.roadview(holder, C.elder, C.pan);
    if (C.rv) { box.classList.add('has-rv'); $('#dial-controls').hidden = true; }
  }
  if (!C.rv) $('#rv-child-note').textContent = Kakao.reason() + '. 지금은 방향만 골라요.';
};
function drawDial() {
  buildNSEW($('#dial-nsew'), 100, 100, 74, 0);
  $('#dial-arrow').setAttribute('transform', `rotate(${C.pan} 100 100)`);
}
$('#dir-left').onclick = () => { C.pan = norm360(C.pan - 15); drawDial(); };
$('#dir-right').onclick = () => { C.pan = norm360(C.pan + 15); drawDial(); };
$('#dir-dest').onclick = () => { C.pan = destBearing(); drawDial(); };
$$('#phrases .chip').forEach(ch => ch.onclick = () => {
  $$('#phrases .chip').forEach(x => x.classList.remove('on'));
  ch.classList.add('on'); $('#phrase-custom').value = '';
  C.phrase = ch.textContent;
});
$('#phrase-custom').oninput = e => {
  const v = e.target.value.trim();
  if (v) { $$('#phrases .chip').forEach(x => x.classList.remove('on')); C.phrase = v; }
};
$('#cdir-next').onclick = () => {
  if (C.rv) { try { C.pan = Math.round(norm360(C.rv.getViewpoint().pan)); } catch (e) {} }
  show('s-csend');
};
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
onShow['s-csend'] = () => {
  $('#pv-phrase').textContent = C.phrase;
  $('#pv-dir').textContent = DIR8[Math.round(C.pan / 45) % 8] + '쪽 ' + C.pan + '°';
};
$('#csend-go').onclick = async () => {
  const app = $('#send-app').checked, kk = $('#send-kakao').checked;
  if (!app && !kk) { banner('보낼 곳을 골라 주세요'); return; }
  const g = { lat: +C.elder.lat.toFixed(6), lng: +C.elder.lng.toFixed(6), pan: Math.round(C.pan), phrase: C.phrase, t: Date.now() };
  if (app) Link.send('guide', g);
  let msg = app ? '이 휴대폰의 어르신 화면에 보냈어요' : '';
  if (kk) {
    const r = await shareGuide(g);
    msg = r === 'kakao' ? '카톡을 열었어요. 받을 사람을 골라 주세요'
      : r === 'share' ? '보낼 곳을 골라 주세요'
      : r === 'copied' ? '링크를 복사했어요. 카톡 대화방에 붙여 넣어 주세요'
      : r === 'cancel' ? '' : '보내지 못했어요. 아래 링크를 길게 눌러 복사해 주세요';
    if (r === 'fail') { showLinkBox(guideUrl(g)); return; }
  }
  if (msg) banner(msg, 6000);
  show('s-cmap');
};
/* 어르신 휴대폰에서 열 링크: 위치·방향·한 마디·목적지를 주소에 담음 (서버 없이 전달) */
function guideUrl(g) {
  const trip = C.trip && C.trip.dest ? { stop: C.trip.stop, dest: C.trip.dest } : null;
  const pick = o => o ? { name: o.name, lat: +(+o.lat).toFixed(6), lng: +(+o.lng).toFixed(6) } : null;
  const data = { g: { lat: g.lat, lng: g.lng, pan: g.pan, phrase: g.phrase }, trip: trip ? { stop: pick(trip.stop), dest: pick(trip.dest) } : null };
  return location.origin + location.pathname + '?role=elder&go=' + encodeURIComponent(JSON.stringify(data));
}
function loadKakaoShare() {
  if (window.Kakao && Kakao.Share) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    s.onload = () => (window.Kakao && Kakao.Share ? resolve() : reject(new Error('sdk')));
    s.onerror = () => reject(new Error('load'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}
async function shareGuide(g) {
  const url = guideUrl(g);
  const who = S.elderName || '어르신';
  const text = who + '께 길 안내: ' + g.phrase + '\n「길 보기」나 링크를 누르면 로드뷰와 방향이 떠요';
  // 1) 카카오톡 공유 (카톡 안 브라우저에서도 됨)
  if (S.kakaoKey) {
    try {
      await loadKakaoShare();
      if (!Kakao.isInitialized()) Kakao.init(S.kakaoKey);
      Kakao.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '길 보기' });
      return 'kakao';
    } catch (e) { console.warn('kakao share', e); }
  }
  // 2) 휴대폰 공유 창
  try { if (navigator.share) { await navigator.share({ title: '길 안내', text, url }); return 'share'; } }
  catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  // 3) 복사
  try { await navigator.clipboard.writeText(text + '\n' + url); return 'copied'; } catch (e) {}
  return 'fail';
}
function showLinkBox(url) {
  let box = $('#link-box');
  if (!box) { box = document.createElement('textarea'); box.id = 'link-box'; box.readOnly = true; box.className = 'plain-input'; $('#csend-go').before(box); }
  box.value = url; box.hidden = false; box.focus(); box.select();
}

function childOnMessage(m) {
  if (m.type === 'elderLoc') { C.elder = m.data; if (current === 's-cmap') drawChildMap(); }
  else if (m.type === 'arrived') { banner(josa(S.elderName || '어르신', '이', '가') + ' 도착했어요', 8000); buzz([200, 100, 200]); }
  else if (m.type === 'alighted') { banner(josa(S.elderName || '어르신', '이', '가') + ' 버스에서 내렸어요', 6000); drawChildMap(); }
}

/* ======================================================
 *  설정
 * ====================================================== */
onShow['s-settings'] = () => {
  $('#set-name').value = S.elderName;
  $('#set-elder-phone').value = S.elderPhone;
  $('#set-family-phone').value = S.familyPhone;
  $('#set-kakao').value = S.kakaoKey;
  $('#set-alight').value = S.alightM;
  $('#set-test').checked = S.test;
  $('#set-share-toggle').textContent = E.sharing ? '위치 보내기 끄기' : '위치 보내기 켜기';
  const st = { none: '키 없음: 지도·로드뷰·장소 찾기는 꺼져 있어요', loading: '불러오는 중', ready: '카카오 지도 연결됨', failed: '불러오기 실패: 키나 등록한 웹 도메인을 확인해 주세요' };
  $('#set-kakao-status').textContent = (Kakao.state === 'failed' ? Kakao.reason() : st[Kakao.state]) || '';
};
$('#set-save').onclick = () => {
  S.elderName = $('#set-name').value.trim() || '어머니'; store.set('elderName', S.elderName);
  S.elderPhone = $('#set-elder-phone').value.trim(); store.set('elderPhone', S.elderPhone);
  S.familyPhone = $('#set-family-phone').value.trim(); store.set('familyPhone', S.familyPhone);
  const key = $('#set-kakao').value.trim();
  const keyChanged = key !== S.kakaoKey;
  S.kakaoKey = key; store.set('kakaoKey', key);
  const a = parseInt($('#set-alight').value, 10); S.alightM = a >= 50 && a <= 2000 ? a : 400; store.set('alightM', S.alightM);
  S.test = $('#set-test').checked; store.set('test', S.test);
  applyNames(); setupTestPanel();
  if (keyChanged) { location.reload(); return; }
  $$('.need').forEach(el => el.classList.remove('need'));
  banner('저장했어요');
  goBack();
};
$('#set-back').onclick = () => { $$('.need').forEach(el => el.classList.remove('need')); goBack(); };
$('#set-share-toggle').onclick = () => {
  E.sharing = !E.sharing; store.set('sharing', E.sharing);
  $('#set-share-toggle').textContent = E.sharing ? '위치 보내기 끄기' : '위치 보내기 켜기';
  banner(E.sharing ? '가족에게 위치를 보내기 시작했어요' : '위치 보내기를 껐어요');
  if (E.sharing) sendElderLoc(true);
};
$('#set-role').onclick = () => { store.del('role'); location.href = location.pathname; };

/* ======================================================
 *  시작
 * ====================================================== */
$$('[data-role-pick]').forEach(b => b.onclick = () => {
  S.role = b.dataset.rolePick; store.set('role', S.role);
  boot();
});
Link.on(m => { if (S.role === 'elder') elderOnMessage(m); else if (S.role === 'child') childOnMessage(m); });

function boot() {
  document.body.dataset.role = S.role || '';
  applyNames();
  setupTestPanel();
  if (S.role === 'elder') elderStart();
  else if (S.role === 'child') childStart();
  else show('s-role');
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
