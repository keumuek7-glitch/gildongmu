import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardingDirectionCheck } from '../src/components/BoardingDirectionCheck';
import { AccessWalkCard, TransferGuidanceCard } from '../src/components/GuidanceCards';
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

describe('큰 노선 띠 (화면 아래, 노선 이름 + 탑승 ➡ 다음 ➡ 내리는 곳)', () => {
  const accessWalk = (nextRide: RideLeg): WalkLeg => ({
    id: 'leg-0',
    type: 'TRANSFER_WALK_LEG',
    walkKind: 'ACCESS',
    distanceM: 300,
    adjustedMin: 5,
    nextRide,
  });
  const renderAccess = (leg: WalkLeg) =>
    renderToStaticMarkup(createElement(AccessWalkCard, { leg, onDone: noop, ...binding }));
  const threeStops: RideLeg = { ...subway, boardName: '청량리', alightName: '신설동', nextStation: '회기', stations: ['청량리', '회기', '외대앞', '신이문', '신설동'] };
  const bus: RideLeg = { ...subway, type: 'BUS_LEG', busNo: '153', lineKey: '버스', boardName: '청량리역', nextStation: '제기동', alightName: '서울대병원', stations: ['청량리역', '제기동', '서울대병원'] };

  it('출발 도보: 전철이면 "4호선"과 탑승역 ➡ 다음 역 ➡ 내리는 역이 띠에 큼직하게', () => {
    const html = renderAccess(accessWalk(threeStops));
    expect(html).toContain('route-strip__line">4호선<');
    for (const n of ['청량리', '회기', '신설동']) expect(html).toContain(`route-strip__stop">${n}<`);
    expect((html.match(/route-strip__arrow/g) ?? []).length).toBe(2);
  });
  it('버스면 "153번" 뒤에 현재 정류장 ➡ 다음 정류장 ➡ 내리는 정류장', () => {
    const html = renderAccess(accessWalk(bus));
    expect(html).toContain('route-strip__line">153번<');
    for (const n of ['청량리역', '제기동', '서울대병원']) expect(html).toContain(`route-strip__stop">${n}<`);
  });
  it('띠는 버튼이 아니라서 버튼 수는 그대로 (환승 1차 확인 = 2개)', () => {
    const html = renderTransfer(transferWalk(threeStops));
    expect(html).toContain('route-strip__stops');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });
  it('걷는 화면 위쪽의 가는 파란 띠는 없어졌다', () => {
    expect(renderAccess(accessWalk(threeStops))).not.toContain('line-banner');
  });
});
