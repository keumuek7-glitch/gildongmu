import { describe, expect, it } from 'vitest';
import {
  boardingCheckFor,
  busAwayMarginFor,
  BUS_AWAY_MARGIN_UNKNOWN_M,
  newAwayTracker,
  stationLabel,
  trackAway,
  transferCheckFor,
} from '../src/core/safety/directionCheck';
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

const bus: RideLeg = {
  ...base,
  type: 'BUS_LEG',
  busNo: '100',
  boardName: 'A정류장',
  alightName: '서울대병원',
  stations: ['A정류장', 'B정류장', '서울대병원'],
  nextStation: 'B정류장',
};

describe('전철 2차 확인 (승강장): ○○역 쪽으로 가는 열차가 맞나요? (화살표 없이)', () => {
  it('다음 역 이름으로 묻고, 화살표 대신 이름으로 확인하라는 안내를 붙인다', () => {
    const c = boardingCheckFor(base);
    expect(c.question).toBe("'제기동역' 쪽으로 가는 열차가 맞나요?");
    expect(c.hint).toBe("화살표는 서 있는 자리마다 방향이 달라요. 안내판에서 '제기동' 글자를 찾으세요");
    expect(`${c.question}${c.hint}${c.wrongTitle}${c.wrongLines.join('')}`).not.toMatch(/[➡⬅→←▶◀⇒]/);
    expect(c.yesLabel).toBe('네, 맞아요');
    expect(c.noLabel).toContain('잘 몰라요');
  });
  it('이미 "역"으로 끝나는 이름에는 역을 또 붙이지 않는다', () => {
    const c = boardingCheckFor({ ...base, boardName: '서울역', nextStation: '남영역' });
    expect(c.question).toBe("'남영역' 쪽으로 가는 열차가 맞나요?");
    expect(c.hint).toContain("'남영' 글자");
  });
  it('다음 역을 모르면 방면으로 묻고, 방면도 모르면 내릴 곳 방향으로 묻는다 (없는 이름은 지어내지 않음)', () => {
    const withWay = boardingCheckFor({ ...base, nextStation: undefined, way: '서울역' });
    expect(withWay.question).toBe("'서울역 방면'이 맞나요?");
    expect(withWay.hint).toContain("'서울역 방면' 글자");
    const noWay = boardingCheckFor({ ...base, nextStation: undefined });
    expect(noWay.question).toBe("'종로5가 방향'이 맞나요?");
  });
  it('아니오·잘 몰라요면 왔던 길로 돌아가 그 방면으로 가라고 한다', () => {
    const c = boardingCheckFor({ ...base, way: '서울역' });
    expect(c.wrongTitle).toBe("왔던 길로 돌아가서 '서울역 방면'으로 가세요");
    expect(c.wrongLines.join(' ')).toContain('종로5가 가요?');
  });
  it('방면이 없으면 내릴 곳 방향으로 안내한다', () => {
    const c = boardingCheckFor(base);
    expect(c.wrongTitle).toBe("왔던 길로 돌아가서 '종로5가 방향'으로 가세요");
  });
});

describe('전철 1차 확인 (환승 구간): ○○방면으로 걸어가고 있나요?', () => {
  it('방면 정보가 있으면 방면으로 묻는다', () => {
    const c = transferCheckFor({ ...base, way: '서울역' });
    expect(c.question).toBe("'서울역 방면'으로 걸어가고 있나요?");
  });
  it('방면을 모르면 내릴 곳 방향으로 묻는다', () => {
    const c = transferCheckFor(base);
    expect(c.question).toBe("'종로5가 방향'으로 걸어가고 있나요?");
  });
  it('아니오·잘 몰라요면 왔던 길로 돌아가 그 방면으로 가라고 한다', () => {
    const c = transferCheckFor({ ...base, way: '서울역' });
    expect(c.wrongTitle).toBe("왔던 길로 돌아가서 '서울역 방면'으로 가세요");
  });
});

describe('버스: 기사님께 방향 확인 (다음 정류장은 묻지 않음)', () => {
  it('타기 전에 기사님께 방향이 맞는지 물어보라고 안내한다', () => {
    const c = boardingCheckFor(bus);
    expect(c.question).toBe("타기 전에 기사님께 '서울대병원 방향'이 맞는지 물어보세요");
    expect(c.question).not.toContain('다음 정류장');
    expect(c.yesLabel).toBe('기사님이 맞대요');
  });
  it('방면(way) 정보가 있으면 그 방향으로 안내한다', () => {
    const c = boardingCheckFor({ ...bus, way: '청량리' });
    expect(c.question).toContain("'청량리 방향'");
  });
  it('아니래요·잘 몰라요면 타지 말고 건너편 정류장에서 다시 물어보라고 한다', () => {
    const c = boardingCheckFor(bus);
    expect(c.wrongTitle).toContain('타지 마세요');
    expect(c.wrongLines.join(' ')).toContain('건너편');
    expect(c.wrongLines.join(' ')).toContain('서울대병원 가요?');
  });
});

describe('stationLabel', () => {
  it('역 이름 뒤에 역을 붙인다', () => {
    expect(stationLabel('청량리')).toBe('청량리역');
    expect(stationLabel('역삼')).toBe('역삼역');
  });
  it('이미 역으로 끝나면 그대로, 괄호 설명은 뗀다', () => {
    expect(stationLabel('서울역')).toBe('서울역');
    expect(stationLabel('제기동(1호선)')).toBe('제기동역');
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
