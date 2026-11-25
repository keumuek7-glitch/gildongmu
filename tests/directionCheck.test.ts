import { describe, expect, it } from 'vitest';
import { boardingCheckFor, newAwayTracker, trackAway } from '../src/core/safety/directionCheck';
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
