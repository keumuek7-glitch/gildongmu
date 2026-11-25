/**
 * 카카오 지도 SDK(로드뷰·장소 찾기) 불러오기. 기존 길동무 legacy/app.js 의 Kakao 객체를 옮김.
 * 카카오 JavaScript 키는 코드에 넣지 않고, 각 휴대폰의 설정에서 넣습니다(저장 키 gd_kakaoKey).
 * 주의: 작업 환경에서 카카오 서버 접속이 막혀 있어 실제 로드뷰는 돌려 보지 못했습니다.
 */
import { gdStore } from './familyRelayClient';
import type { LatLng } from '../core/navigation/compass';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { kakao?: any }
}

export type KakaoState = 'none' | 'loading' | 'ready' | 'failed';

let state: KakaoState = 'none';
let loadPromise: Promise<void> | null = null;
let failWhy = '';
let rvWhy = '';

export const getKakaoKey = (): string => gdStore.get('kakaoKey', '');
export function setKakaoKey(k: string): void {
  const v = k.trim();
  if (v === getKakaoKey()) return;
  gdStore.set('kakaoKey', v);
  // 키가 바뀌면 다시 불러오도록 (이미 불러온 SDK는 새로 고침해야 바뀜)
  if (state !== 'ready') { state = 'none'; loadPromise = null; }
}

export const kakaoState = () => state;
export const kakaoReady = () => state === 'ready' && !!window.kakao?.maps;

export function loadKakao(timeoutMs = 12000): Promise<void> {
  if (loadPromise) return loadPromise;
  const key = getKakaoKey();
  if (!key) { state = 'none'; return Promise.reject(new Error('nokey')); }
  state = 'loading';
  loadPromise = new Promise<void>((resolve, reject) => {
    const bad = (why: string) => { state = 'failed'; failWhy = why; loadPromise = null; reject(new Error(why)); };
    const t = setTimeout(() => bad('timeout'), timeoutMs);
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    s.onload = () => {
      // 키가 틀렸거나 등록한 웹 도메인이 다르면 kakao 객체가 없거나 load가 끝나지 않음
      if (!window.kakao?.maps?.load) { clearTimeout(t); bad('sdk'); return; }
      try {
        window.kakao.maps.load(() => { clearTimeout(t); state = 'ready'; resolve(); });
      } catch { clearTimeout(t); bad('sdk'); }
    };
    s.onerror = () => { clearTimeout(t); bad('blocked'); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** 가장 가까운(100m 안) 로드뷰를 그 자리·방향(pan)으로 띄웁니다. 실패하면 null */
export function showRoadview(el: HTMLElement, pos: LatLng, pan: number, timeoutMs = 12000): Promise<unknown | null> {
  return new Promise((resolve) => {
    if (!kakaoReady()) { resolve(null); return; }
    const k = window.kakao;
    let done = false;
    const finish = (rv: unknown, why = '') => {
      if (done) return;
      done = true;
      clearTimeout(t);
      rvWhy = why;
      resolve(rv);
    };
    const t = setTimeout(() => finish(null, 'rvtimeout'), timeoutMs);
    try {
      el.innerHTML = '';
      const rv = new k.maps.Roadview(el);
      const rc = new k.maps.RoadviewClient();
      const p = new k.maps.LatLng(pos.lat, pos.lng);
      rc.getNearestPanoId(p, 100, (id: number | null) => {
        if (id === null) { finish(null, 'nopano'); return; }
        k.maps.event.addListener(rv, 'init', () => {
          rv.setViewpoint({ pan, tilt: 0, zoom: 0 });
          finish(rv);
        });
        rv.setPanoId(id, p);
      });
    } catch {
      finish(null, 'error');
    }
  });
}

/** 로드뷰가 안 뜬 이유 한 줄 */
export function kakaoReason(): string {
  if (!getKakaoKey()) return '카카오 키가 없어요. 설정에서 키를 넣어 주세요';
  if (state === 'failed') {
    return failWhy === 'timeout'
      ? '카카오 지도를 불러오지 못했어요 (시간 초과)'
      : '카카오 지도를 불러오지 못했어요. 키 또는 카카오에 등록한 웹 주소를 확인해 주세요';
  }
  if (rvWhy === 'nopano') return '이 자리 100m 안에는 로드뷰가 없어요';
  if (rvWhy === 'rvtimeout') return '로드뷰를 불러오지 못했어요 (시간 초과)';
  if (rvWhy === 'error') return '로드뷰를 여는 중 오류가 났어요';
  return '로드뷰를 불러오지 못했어요';
}

export interface PlaceResult {
  name: string;
  addr: string;
  lat: number;
  lng: number;
}

/** 카카오 장소 찾기 (키워드). 불러오지 못했으면 null, 없으면 [] */
export function searchPlaces(q: string): Promise<PlaceResult[] | null> {
  return new Promise((resolve) => {
    if (!kakaoReady() || !window.kakao.maps.services) { resolve(null); return; }
    const k = window.kakao;
    const ps = new k.maps.services.Places();
    ps.keywordSearch(q, (data: Array<Record<string, string>>, status: string) => {
      if (status !== k.maps.services.Status.OK) { resolve([]); return; }
      resolve(
        data.slice(0, 10).map((d) => ({
          name: d.place_name,
          addr: d.road_address_name || d.address_name || '',
          lat: Number(d.y),
          lng: Number(d.x),
        })),
      );
    });
  });
}
