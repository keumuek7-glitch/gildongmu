import { describe, expect, it } from 'vitest';
import { dirName, layoutFamilyMap } from '../src/core/family/familyMap';

const elder = { lat: 37.57, lng: 127.0 };

describe('가족 화면 약도', () => {
  it('목적지가 어느 방향이든 늘 어르신 바로 위에 그린다', () => {
    for (const dest of [
      { lat: 37.58, lng: 127.0 }, // 북
      { lat: 37.57, lng: 127.01 }, // 동
      { lat: 37.56, lng: 126.99 }, // 남서
    ]) {
      const L = layoutFamilyMap(elder, dest);
      expect(L.dest!.x).toBeCloseTo(L.elder.x);
      expect(L.dest!.y).toBeLessThan(L.elder.y);
    }
  });
  it('목적지가 동쪽이면 북쪽 표시는 왼쪽으로 90° 돈다', () => {
    const L = layoutFamilyMap(elder, { lat: 37.57, lng: 127.01 });
    expect(Math.round(L.northRotate)).toBe(-90);
  });
  it('어르신과 목적지 사이의 내릴 곳은 둘 사이에 그린다', () => {
    const L = layoutFamilyMap(elder, { lat: 37.58, lng: 127.0 }, { lat: 37.575, lng: 127.0 });
    expect(L.stop!.y).toBeGreaterThan(L.dest!.y);
    expect(L.stop!.y).toBeLessThan(L.elder.y);
  });
  it('도착지가 없으면 어르신만 가운데', () => {
    const L = layoutFamilyMap(elder, null);
    expect(L.dest).toBeNull();
    expect(L.elder.y).toBe(L.H / 2);
  });
  it('어르신이 목적지 쪽을 보면 부채꼴은 위(0°)', () => {
    const L = layoutFamilyMap({ ...elder, heading: 0 }, { lat: 37.58, lng: 127.0 });
    expect(Math.round(L.headingRotate!)).toBe(0);
  });
  it('8방향 이름', () => {
    expect(dirName(0)).toBe('북');
    expect(dirName(100)).toBe('동');
    expect(dirName(350)).toBe('북');
    expect(dirName(225)).toBe('남서');
  });
});
