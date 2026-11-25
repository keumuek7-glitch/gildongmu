import { describe, expect, it } from 'vitest';
import { routeStripNames, stripLineLabel } from '../src/core/stateMachine/routeStrip';
import type { RideLeg } from '../src/core/stateMachine/routeLegBuilder';
import { BUS_VISUAL } from '../src/core/metadata/subwayLineVisuals';

const base: RideLeg = {
  id: 'r',
  type: 'SUBWAY_LEG',
  lineKey: '1호선',
  visual: BUS_VISUAL,
  boardName: '청량리',
  alightName: '신설동',
  stations: ['청량리', '회기', '외대앞', '신설동'],
  hopSeconds: [60, 60, 60],
  expectedSec: 180,
  nextStation: '회기',
};

describe('routeStripNames', () => {
  it('탑승 ➡ 다음 ➡ 내리는 곳 세 개', () => {
    expect(routeStripNames(base)).toEqual(['청량리', '회기', '신설동']);
  });
  it('한 정거장만 가면 이름이 겹치지 않게 두 개', () => {
    expect(routeStripNames({ ...base, stations: ['청량리', '회기'], alightName: '회기' })).toEqual(['청량리', '회기']);
  });
  it('nextStation 이 없으면 stations[1] 을 쓰고, 둘 다 없으면 건너뜀(지어내지 않음)', () => {
    expect(routeStripNames({ ...base, nextStation: undefined })).toEqual(['청량리', '회기', '신설동']);
    expect(routeStripNames({ ...base, nextStation: undefined, stations: ['청량리'] })).toEqual(['청량리', '신설동']);
  });
  it('끝의 괄호 설명은 떼고, 빈 이름은 뺀다', () => {
    expect(routeStripNames({ ...base, boardName: '', stations: ['청량리(서울시립대입구)', '회기'] })).toEqual(['청량리', '회기', '신설동']);
  });
});

describe('stripLineLabel', () => {
  it('전철은 노선 이름, 버스는 번호+번', () => {
    expect(stripLineLabel(base)).toBe('1호선');
    expect(stripLineLabel({ ...base, type: 'BUS_LEG', busNo: '153' })).toBe('153번');
    expect(stripLineLabel({ ...base, type: 'BUS_LEG', busNo: undefined })).toBe('버스');
  });
});
