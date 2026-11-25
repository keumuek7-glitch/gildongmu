import { describe, expect, it } from 'vitest';
import { routeStripStops, stripLineLabel } from '../src/core/stateMachine/routeStrip';
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

const names = (leg: RideLeg) => routeStripStops(leg).map((s) => s.name);

describe('routeStripStops (화살표 없이 위에서 아래로)', () => {
  it('타는 역 / 다음 역 / 내리는 역 세 줄과 이름표', () => {
    expect(routeStripStops(base)).toEqual([
      { role: 'board', label: '타는 역', name: '청량리' },
      { role: 'next', label: '다음 역', name: '회기' },
      { role: 'alight', label: '내리는 역', name: '신설동' },
    ]);
  });
  it('버스는 타는 곳 / 다음 / 내리는 곳', () => {
    const bus: RideLeg = { ...base, type: 'BUS_LEG', busNo: '153' };
    expect(routeStripStops(bus).map((s) => s.label)).toEqual(['타는 곳', '다음', '내리는 곳']);
  });
  it('한 정거장만 가면 겹치는 이름은 "내리는 역" 하나만', () => {
    expect(routeStripStops({ ...base, stations: ['청량리', '회기'], alightName: '회기' })).toEqual([
      { role: 'board', label: '타는 역', name: '청량리' },
      { role: 'alight', label: '내리는 역', name: '회기' },
    ]);
  });
  it('nextStation 이 없으면 stations[1] 을 쓰고, 둘 다 없으면 건너뜀(지어내지 않음)', () => {
    expect(names({ ...base, nextStation: undefined })).toEqual(['청량리', '회기', '신설동']);
    expect(names({ ...base, nextStation: undefined, stations: ['청량리'] })).toEqual(['청량리', '신설동']);
  });
  it('끝의 괄호 설명은 떼고, 빈 이름은 뺀다', () => {
    expect(names({ ...base, boardName: '', stations: ['청량리(서울시립대입구)', '회기'] })).toEqual(['청량리', '회기', '신설동']);
  });
});

describe('stripLineLabel', () => {
  it('전철은 노선 이름, 버스는 번호+번', () => {
    expect(stripLineLabel(base)).toBe('1호선');
    expect(stripLineLabel({ ...base, type: 'BUS_LEG', busNo: '153' })).toBe('153번');
    expect(stripLineLabel({ ...base, type: 'BUS_LEG', busNo: undefined })).toBe('버스');
  });
});
