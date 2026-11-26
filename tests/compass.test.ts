import { describe, expect, it } from 'vitest';
import {
  ALIGN_DEG,
  bearingDeg,
  compassGuide,
  distM,
  fmtDist,
  headingFromOrientation,
  norm180,
  nsewPositions,
  unwrapAngle,
  smoothHeading,
} from '../src/core/navigation/compass';
import { buildRouteLegs, type WalkLeg } from '../src/core/stateMachine/routeLegBuilder';
import { parseOdsayResponse } from '../src/core/parser/odsayRouteParser';
import sample from '../src/data/sampleOdsayResponse.json';

const SNUH = { lat: 37.5797, lng: 126.999 };
const south = (m: number) => ({ lat: SNUH.lat - m / 111_195, lng: SNUH.lng }); // 위도 1도 ≈ 111.195km

describe('거리·방위', () => {
  it('남쪽 330m 지점에서 목적지는 북쪽(0°), 거리 약 330m', () => {
    const p = south(330);
    expect(distM(p, SNUH)).toBeGreaterThan(320);
    expect(distM(p, SNUH)).toBeLessThan(340);
    expect(Math.round(bearingDeg(p, SNUH))).toBe(0);
  });
  it('동쪽 목적지는 90° 근처', () => {
    expect(Math.round(bearingDeg(SNUH, { lat: SNUH.lat, lng: SNUH.lng + 0.01 }))).toBe(90);
  });
  it('각도 정리: 350° 차이는 -10°', () => {
    expect(norm180(350)).toBe(-10);
    expect(norm180(-190)).toBe(170);
  });
  it('거리 글자', () => {
    expect(fmtDist(334)).toBe('330m');
    expect(fmtDist(1260)).toBe('1.3km');
  });
});

describe('나침반 안내 문구', () => {
  const p = south(300);
  it(`목적지 쪽(±${ALIGN_DEG}°)을 보면 "이쪽이에요"`, () => {
    expect(compassGuide(p, 10, SNUH).status).toBe('ALIGNED');
    expect(compassGuide(p, 345, SNUH).text).toBe('이쪽이에요');
  });
  it('동쪽(90°)을 보면 목적지는 왼쪽, 서쪽(270°)을 보면 오른쪽', () => {
    const east = compassGuide(p, 90, SNUH);
    expect(east.text).toBe('왼쪽으로 돌아요');
    expect(Math.round(east.arrowRotate)).toBe(90);
    expect(compassGuide(p, 270, SNUH).text).toBe('오른쪽으로 돌아요');
  });
  it('위치·방향을 모르면 기다리는 문구, 30m 안이면 거의 다 옴', () => {
    expect(compassGuide(null, 0, SNUH).status).toBe('NO_POSITION');
    expect(compassGuide(p, null, SNUH).status).toBe('NO_HEADING');
    expect(compassGuide(south(20), 180, SNUH).status).toBe('ARRIVED');
  });
});

describe('센서 값', () => {
  it('iOS webkitCompassHeading을 먼저 쓰고, 안드로이드는 360-alpha', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 45, absolute: true, alpha: 10 })).toBe(45);
    expect(headingFromOrientation({ absolute: true, alpha: 90 })).toBe(270);
    expect(headingFromOrientation({ absolute: false, alpha: 90 })).toBeNull();
    expect(headingFromOrientation({ webkitCompassHeading: 350 }, 90)).toBe(80);
  });
  it('359°와 1° 사이를 평활해도 180°로 튀지 않는다', () => {
    const a = smoothHeading(null, 359);
    const b = smoothHeading(a, 1, 0.5);
    expect(Math.min(b.heading, 360 - b.heading)).toBeLessThan(2);
  });
  it('화면 위가 북쪽이면 "북" 글자는 위에', () => {
    const n = nsewPositions(175, 205, 165, 0).find((m) => m.name === '북')!;
    expect(n.x).toBeCloseTo(175);
    expect(n.y).toBeCloseTo(40);
  });
});

describe('도보 구간 나침반 목표', () => {
  it('마지막 도보 구간은 목적지 좌표(ODsay x,y → 위도·경도)를 목표로 갖는다', () => {
    const route = parseOdsayResponse(sample)[0];
    const legs = buildRouteLegs(route, { destName: '서울대병원', destCoord: { x: SNUH.lng, y: SNUH.lat } });
    const exit = legs.find((l): l is WalkLeg => l.type === 'TRANSFER_WALK_LEG' && l.walkKind === 'EXIT');
    expect(exit?.target).toEqual({ name: '서울대병원', lat: SNUH.lat, lng: SNUH.lng });
  });
  it('목적지 좌표를 안 주면 목표 없음 (버튼이 안 나옴)', () => {
    const route = parseOdsayResponse(sample)[0];
    const legs = buildRouteLegs(route, { destName: '서울대병원' });
    const exit = legs.find((l): l is WalkLeg => l.type === 'TRANSFER_WALK_LEG' && l.walkKind === 'EXIT');
    expect(exit?.target).toBeUndefined();
  });
});

describe('unwrapAngle (바늘이 거꾸로 한 바퀴 돌지 않게)', () => {
  it('359°→1°은 +2°만 더 돌아간다', () => {
    expect(unwrapAngle(359, 1)).toBe(361);
  });
  it('1°→359°는 -2°만 돌아간다', () => {
    expect(unwrapAngle(1, 359)).toBe(-1);
  });
  it('작은 변화는 그대로 이어진다', () => {
    expect(unwrapAngle(100, 130)).toBe(130);
  });
});
