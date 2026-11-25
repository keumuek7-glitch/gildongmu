import { describe, expect, it } from 'vitest';
import {
  ALIGHT_NEAR_M_DEFAULT,
  nextAlightStage,
  sanitizeNearM,
  stageFromFix,
} from '../src/core/navigation/proximityAlight';
import { buildRouteLegs, isRideLeg } from '../src/core/stateMachine/routeLegBuilder';
import { parseOdsayResponse } from '../src/core/parser/odsayRouteParser';
import sample from '../src/data/sampleOdsayResponse.json';

describe('버스 좌표 하차 알림 단계', () => {
  it('400m 밖은 조용, 400m 안 "다음에 내려요", 60m 안 "지금 내려요"', () => {
    expect(nextAlightStage(0, 900).alert).toBeNull();
    const a = nextAlightStage(0, 380);
    expect(a.stage).toBe(1);
    expect(a.alert?.text).toBe('다음에 내려요');
    const b = nextAlightStage(a.stage, 50);
    expect(b.stage).toBe(2);
    expect(b.alert?.text).toBe('지금 내려요');
    expect(b.alert?.vibrate.length).toBeGreaterThan(a.alert!.vibrate.length);
  });
  it('같은 단계는 다시 알리지 않고, 멀어져도 단계가 내려가지 않는다', () => {
    expect(nextAlightStage(1, 300).alert).toBeNull();
    expect(nextAlightStage(2, 30).alert).toBeNull();
    expect(nextAlightStage(1, 800).stage).toBe(1);
  });
  it('처음 받은 위치가 이미 60m 안이면 바로 "지금 내려요"', () => {
    expect(nextAlightStage(0, 20).alert?.stage).toBe(2);
  });
  it('설정한 거리(기존 gd_alightM)를 쓴다', () => {
    expect(nextAlightStage(0, 550, 600).stage).toBe(1);
    expect(nextAlightStage(0, 550).stage).toBe(0);
  });
  it('GPS 오차가 150m보다 크면 그 값은 건너뛴다', () => {
    const stop = { lat: 37.579, lng: 126.9995 };
    expect(stageFromFix(0, stop, stop, { accuracyM: 300 }).alert).toBeNull();
    expect(stageFromFix(0, stop, stop, { accuracyM: 20 }).alert?.stage).toBe(2);
  });
  it('설정값 정리', () => {
    expect(sanitizeNearM('abc')).toBe(ALIGHT_NEAR_M_DEFAULT);
    expect(sanitizeNearM(10)).toBe(100);
    expect(sanitizeNearM(5000)).toBe(1500);
    expect(sanitizeNearM('450')).toBe(450);
  });
});

describe('버스 구간의 내릴 정류장 좌표', () => {
  it('샘플 버스 구간은 마지막 정류장 좌표(x=경도, y=위도)를 갖고, 전철 구간은 갖지 않는다', () => {
    const routes = parseOdsayResponse(sample);
    const legs = routes.flatMap((r) => buildRouteLegs(r)).filter(isRideLeg);
    const bus = legs.find((l) => l.type === 'BUS_LEG');
    expect(bus?.alightCoord).toEqual({ lat: 37.579, lng: 126.9995 });
    expect(legs.filter((l) => l.type === 'SUBWAY_LEG').every((l) => l.alightCoord === undefined)).toBe(true);
  });
});
