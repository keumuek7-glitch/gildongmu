import { describe, expect, it } from 'vitest';
import { boardingCheckFor, busAwayMarginFor, BUS_AWAY_MARGIN_UNKNOWN_M, newAwayTracker, trackAway } from '../src/core/safety/directionCheck';
import { distM } from '../src/core/navigation/compass';
import { buildRouteLegs, isRideLeg } from '../src/core/stateMachine/routeLegBuilder';
import { parseOdsayResponse } from '../src/core/parser/odsayRouteParser';
import sample from '../src/data/sampleOdsayResponse.json';
import type { RideLeg } from '../src/core/stateMachine/routeLegBuilder';
import { BUS_VISUAL } from '../src/core/metadata/subwayLineVisuals';

const base: RideLeg = {
  id: 'leg-1',
  type: 'SUBWAY_LEG',
  lineKey: '1호선',
  visual: BUS_VISUAL,
  boardName: '청량리',
  alightName: '종로5가',
  stations: ['청량리', '제기동', '신설동', '동대문', '종로5가'],
  hopSeconds: [120, 120, 120, 120],
  expectedSec: 480,
  nextStation: '제기동',
};

describe('타기 전 방향 확인 문구', () => {
  it('전철: 방면 정보가 있으면 방면으로 묻는다', () => {
    const c = boardingCheckFor({ ...base, way: '서울역' });
    expect(c.lookFor).toBe('서울역 방면');
    expect(c.question).toContain("'서울역 방면'");
  });
  it('전철: 방면이 없으면 다음 역 이름으로 묻고, 틀리면 타지 말라고 한다', () => {
    const c = boardingCheckFor(base);
    expect(c.lookFor).toBe('다음 역 제기동');
    expect(c.question).toContain("'제기동'");
    expect(c.wrongTitle).toContain('타지 마세요');
    expect(c.wrongLines.join(' ')).toContain('종로5가 가요?');
  });
  it('버스: 다음 정류장으로 묻고, 틀리면 건너편 정류장과 기사님께 묻기를 안내한다', () => {
    const c = boardingCheckFor({ ...base, type: 'BUS_LEG', busNo: '100', boardName: 'A', alightName: 'C', stations: ['A', 'B', 'C'], nextStation: 'B' });
    expect(c.lookFor).toBe('다음 정류장 B');
    expect(c.wrongLines.join(' ')).toContain('건너편');
    expect(c.unsureLines[0]).toContain('기사님');
  });
  it('버스: 다음 정류장을 모르면 버스 번호로 묻는다 (없는 이름은 지어내지 않음)', () => {
    const c = boardingCheckFor({ ...base, type: 'BUS_LEG', busNo: '100', stations: ['A'], nextStation: undefined });
    expect(c.lookFor).toBe('100번');
  });
});

describe('버스 탄 뒤 멀어짐 감지', () => {
  it('가장 가까웠던 거리보다 300m 넘게 멀어지면 한 번만 경고', () => {
    const t = newAwayTracker();
    expect(trackAway(t, 2000)).toBe(false);
    expect(trackAway(t, 1500)).toBe(false); // 가까워짐
    expect(trackAway(t, 1750)).toBe(false); // 250m 멀어짐: 아직
    expect(trackAway(t, 1850)).toBe(true); // 350m 멀어짐
    expect(trackAway(t, 2500)).toBe(false); // 이미 경고함
  });
  it('계속 가까워지면 경고 없음', () => {
    const t = newAwayTracker();
    expect([3000, 2500, 1800, 900, 300].some((d) => trackAway(t, d))).toBe(false);
  });
});

import { josa } from '../src/core/safety/directionCheck';
describe('조사', () => {
  it('받침에 맞게 붙인다 (따옴표 안 글자 기준)', () => {
    expect(josa("'제기동'", '으로', '로')).toBe("'제기동'으로");
    expect(josa("'서울'", '으로', '로')).toBe("'서울'로");
    expect(josa("'신설동'", '으로', '로')).toBe("'신설동'으로");
    expect(josa("'동대문'", '이', '가')).toBe("'동대문'이");
    expect(josa("'종로5가'", '를', '를')).toBe("'종로5가'를");
    expect(josa("'다음 역 제기동'", '을', '를')).toBe("'다음 역 제기동'을");
    expect(josa("'다음 정류장 B'", '을', '를')).toBe("'다음 정류장 B'를");
  });
});

describe('노선 모양에 맞춘 지나침 여유', () => {
  const alight = { lat: 37.6, lng: 127.0 };
  const north = (m: number) => ({ lat: alight.lat - m / 111_195, lng: alight.lng }); // 내릴 곳 남쪽 m 지점
  it('곧게 가까워지는 노선은 기본 300m', () => {
    expect(busAwayMarginFor([north(2000), north(1500), north(800), north(0)], alight, distM)).toBe(300);
  });
  it('빙 돌아가며 700m 멀어졌다 오는 노선은 300 + 700 = 1000m', () => {
    const m = busAwayMarginFor([north(1500), north(1000), north(1700), north(1200), north(0)], alight, distM);
    expect(m).toBeGreaterThan(990);
    expect(m).toBeLessThan(1010);
  });
  it('정류장 좌표를 모르면 넉넉히 600m', () => {
    expect(busAwayMarginFor([], alight, distM)).toBe(BUS_AWAY_MARGIN_UNKNOWN_M);
    expect(busAwayMarginFor([north(100)], undefined, distM)).toBe(BUS_AWAY_MARGIN_UNKNOWN_M);
  });
  it('여유가 1000m인 노선은 700m 멀어져도 경고하지 않고, 1100m면 경고', () => {
    const t = newAwayTracker();
    trackAway(t, 200, 1000);
    expect(trackAway(t, 900, 1000)).toBe(false);
    expect(trackAway(t, 1300, 1000)).toBe(true);
  });
  it('샘플 버스 구간에도 여유가 자동으로 붙는다 (300m 이상)', () => {
    const bus = parseOdsayResponse(sample).flatMap((r) => buildRouteLegs(r)).filter(isRideLeg).find((l) => l.type === 'BUS_LEG');
    expect(bus?.awayMarginM).toBeGreaterThanOrEqual(300);
  });
});

describe('조사: 괄호 뒤', () => {
  it('괄호 설명은 빼고 앞 글자로 판단', () => {
    expect(josa('서울대병원 앞 정류장(예시)', '을', '를')).toBe('서울대병원 앞 정류장(예시)을');
    expect(josa("'제기동(1호선)'", '으로', '로')).toBe("'제기동(1호선)'으로");
  });
});
