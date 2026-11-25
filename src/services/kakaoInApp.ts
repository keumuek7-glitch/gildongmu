/**
 * 카카오톡 안 브라우저 처리와 카톡 공유 (기존 길동무 legacy/app.js 에서 옮김).
 *  - 카톡 안 브라우저로 열리면 휴대폰 기본 브라우저(크롬 등)로 다시 엶:
 *    등록·위치 허가가 한곳에 남고 말소리도 쓸 수 있게. (?inapp=1 이면 그대로 둠)
 *  - 두 휴대폰을 연결하면 메시지는 앱 안에서 오가므로 카톡 링크는 처음 연결 때 한 번만 씀
 */
import { getKakaoKey } from './kakaoMaps';

export const isKakaoInApp = (ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '') => /KAKAOTALK/i.test(ua);

export function shouldLeaveKakao(ua: string, search: string): boolean {
  return isKakaoInApp(ua) && new URLSearchParams(search).get('inapp') !== '1';
}

export function kakaoExternalUrl(url: string): string {
  return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url.split('#')[0]);
}

/** 크롬(기본 브라우저)으로 다시 열기 */
export function openInExternalBrowser(url = location.href): void {
  const u = url.split('#')[0];
  if (isKakaoInApp()) location.href = kakaoExternalUrl(u);
  else if (/Android/i.test(navigator.userAgent)) {
    location.href = 'intent://' + u.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
  } else window.open(u, '_blank');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadKakaoShare(): Promise<any> {
  const w = window as any;
  if (w.Kakao?.init) return Promise.resolve(w.Kakao);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    s.onload = () => (w.Kakao?.init ? resolve(w.Kakao) : reject(new Error('sdk')));
    s.onerror = () => reject(new Error('load'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 10000);
  });
}

export type ShareResult = 'kakao' | 'share' | 'copied' | 'cancel' | 'fail';

/** 카톡으로 글+링크 보내기: 카톡 공유 → 휴대폰 공유 창 → 복사 순서 */
export async function sendKakao(text: string, url: string, buttonTitle: string): Promise<ShareResult> {
  const key = getKakaoKey();
  if (key) {
    try {
      const KS = await loadKakaoShare();
      if (!KS.isInitialized()) KS.init(key);
      KS.Share.sendDefault({ objectType: 'text', text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle });
      return 'kakao';
    } catch (e) {
      console.warn('kakao share', e);
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: '길동무', text, url });
      return 'share';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancel';
  }
  try {
    await navigator.clipboard.writeText(text + '\n' + url);
    return 'copied';
  } catch {
    return 'fail';
  }
}

export function shareResultText(r: ShareResult, who = '받을 사람'): string {
  return r === 'kakao' ? `카톡을 열었어요. ${who}을 골라 주세요`
    : r === 'share' ? '보낼 곳을 골라 주세요'
    : r === 'copied' ? '복사했어요. 카톡에 붙여 넣어 주세요'
    : r === 'cancel' ? '보내지 않았어요'
    : '보내지 못했어요. 아래 링크를 길게 눌러 복사해 주세요';
}
