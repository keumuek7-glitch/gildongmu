import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardingDirectionCheck } from '../src/components/BoardingDirectionCheck';
import { TransferGuidanceCard } from '../src/components/GuidanceCards';
import type { RideLeg, WalkLeg } from '../src/core/stateMachine/routeLegBuilder';
import { BUS_VISUAL } from '../src/core/metadata/subwayLineVisuals';

const noop = () => {};
const binding = { speak: noop, spoken: { has: () => false, add: noop } };

const subway: RideLeg = {
  id: 'leg-2',
  type: 'SUBWAY_LEG',
  lineKey: '4호선',
  visual: BUS_VISUAL,
  boardName: '동대문',
  alightName: '혜화',
  stations: ['동대문', '혜화'],
  hopSeconds: [120],
  expectedSec: 120,
  way: '당고개',
  nextStation: '혜화',
};

const transferWalk = (nextRide: RideLeg): WalkLeg => ({
  id: 'leg-1',
  type: 'TRANSFER_WALK_LEG',
  walkKind: 'TRANSFER',
  fromName: '동대문',
  toName: '동대문',
  distanceM: 120,
  adjustedMin: 4,
  nextRide,
});

const renderTransfer = (leg: WalkLeg) =>
  renderToStaticMarkup(createElement(TransferGuidanceCard, { leg, onDone: noop, ...binding }));

describe('환승 구간 1차 확인 화면', () => {
  it('갈아탈 것이 전철이면 먼저 "○○방면으로 걸어가고 있나요?"를 묻고 버튼은 2개', () => {
    const html = renderTransfer(transferWalk(subway));
    expect(html).toContain('&#x27;당고개 방면&#x27;으로 걸어가고 있나요?');
    expect(html).toContain('네, 맞아요');
    expect(html).toContain('아니오 · 잘 몰라요');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    // 걷는 안내 카드의 "다 왔어요" 버튼은 아직 안 나옴
    expect(html).not.toContain('다 왔어요');
  });

  it('갈아탈 것이 버스면 1차 확인 없이 바로 걷는 안내 (버스는 타기 전 기사님께 확인)', () => {
    const bus: RideLeg = { ...subway, type: 'BUS_LEG', busNo: '100', way: undefined };
    const html = renderTransfer(transferWalk(bus));
    expect(html).not.toContain('걸어가고 있나요?');
    expect(html).toContain('다 왔어요');
  });
});

describe('타기 전 확인 화면', () => {
  const render = (leg: RideLeg) =>
    renderToStaticMarkup(createElement(BoardingDirectionCheck, { leg, onBoarded: noop, speak: noop }));

  it('전철 승강장 2차: 현재역 ➡ 다음 역 방향, 버튼 2개', () => {
    const html = render(subway);
    expect(html).toContain('&#x27;동대문역&#x27; ➡ &#x27;혜화역&#x27; 방향이 맞나요?');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it('버스: 다음 정류장을 묻지 않고 기사님께 방향 확인을 안내, 버튼 2개', () => {
    const html = render({ ...subway, type: 'BUS_LEG', busNo: '100', way: undefined, alightName: '서울대병원' });
    expect(html).toContain('타기 전에 기사님께');
    expect(html).toContain('방향&#x27;이 맞는지 물어보세요');
    expect(html).not.toContain('다음 정류장');
    expect(html).toContain('기사님이 맞대요');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });
});
