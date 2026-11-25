import { describe, expect, it } from 'vitest';
import { buildGuideLink, parseGuideLink } from '../src/core/guardian/familyRelay';
import { kakaoExternalUrl, shouldLeaveKakao } from '../src/services/kakaoInApp';

const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 KAKAOTALK 10.0.0';

describe('카톡 안 브라우저', () => {
  it('카톡 안이면 기본 브라우저로 다시 열고, ?inapp=1 이면 그대로 둔다', () => {
    expect(shouldLeaveKakao(KAKAO_UA, '?role=elder&pair=x')).toBe(true);
    expect(shouldLeaveKakao(KAKAO_UA, '?inapp=1')).toBe(false);
    expect(shouldLeaveKakao('Mozilla/5.0 Chrome/140', '')).toBe(false);
  });
  it('주소 전체(연결 링크 포함)를 그대로 넘긴다', () => {
    const u = 'https://keumuek7-glitch.github.io/gildongmu/?role=elder&pair=abc#x';
    expect(kakaoExternalUrl(u)).toBe('kakaotalk://web/openExternal?url=' + encodeURIComponent(u.split('#')[0]));
  });
});

describe('카톡으로 보내는 길 안내 링크 (?go=, 기존 길동무와 같은 모양)', () => {
  const data = {
    g: { lat: 37.576, lng: 126.999, pan: 30, phrase: '길 건너요' },
    trip: { stop: null, dest: { name: '서울대학교병원', lat: 37.5797, lng: 126.999 } },
  };
  it('만든 링크를 다시 읽으면 같은 내용', () => {
    const url = buildGuideLink('https://keumuek7-glitch.github.io/gildongmu/?role=child', data);
    const r = parseGuideLink(new URL(url).search);
    expect(new URL(url).searchParams.get('role')).toBe('elder');
    expect(r?.guide).toEqual(data.g);
    expect(r?.trip?.dest).toEqual(data.trip.dest);
  });
  it('기존 앱이 보낸 링크 모양(trip.stop 포함)도 읽는다', () => {
    const go = JSON.stringify({ g: { lat: 37.35, lng: 127.109, pan: 0, phrase: '곧장 가요' }, trip: { stop: { name: '아름마을', lat: 37.364, lng: 127.124 }, dest: { name: '아름마을', lat: 37.3652, lng: 127.1262 } } });
    const r = parseGuideLink('?role=elder&go=' + encodeURIComponent(go));
    expect(r?.trip?.stop?.name).toBe('아름마을');
  });
  it('좌표가 이상하면 버린다', () => {
    expect(parseGuideLink('?go=' + encodeURIComponent('{"g":{"lat":"x","lng":1}}'))).toBeNull();
    expect(parseGuideLink('?go=notjson')).toBeNull();
  });
});
