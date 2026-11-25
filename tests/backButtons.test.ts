import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import sample from '../src/data/sampleOdsayResponse.json';
import { BackButton } from '../src/components/BackButton';
import { classifyRoutes } from '../src/core/classifier/seniorRouteClassifier';
import { parseOdsayResponse } from '../src/core/parser/odsayRouteParser';
import { createMultiLegState, multiLegReducer, type MultiLegState } from '../src/core/stateMachine/multiLegManager';
import { buildRouteLegs } from '../src/core/stateMachine/routeLegBuilder';
import { ActiveGuideScreen } from '../src/screens/ActiveGuideScreen';
import { DirectionSender } from '../src/screens/FamilyScreen';
import { PlaceConfirmScreen } from '../src/screens/PlaceConfirmScreen';
import { RouteChoiceScreen } from '../src/screens/RouteChoiceScreen';

const noop = () => {};
const T0 = 1_700_000_000_000;
const NO_ARROW = /[➡⬅→←▶◀⇒⇐]/;
const count = (html: string, text: string) => html.split(text).length - 1;
/** 어르신 화면의 큰 버튼: 주요(primary)·보조(secondary) 버튼 */
const bigButtons = (html: string) => count(html, 'btn--primary') + count(html, 'btn--secondary');
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('BackButton', () => {
  it('기본은 [← 뒤로], arrow=false 이면 화살표 없는 [뒤로]', () => {
    expect(render(createElement(BackButton, { onClick: noop }))).toContain('← 뒤로');
    const plain = render(createElement(BackButton, { onClick: noop, arrow: false }));
    expect(plain).toContain('>뒤로<');
    expect(plain).not.toMatch(NO_ARROW);
  });
});

describe('장소 고르기', () => {
  const candidates = [
    { name: '서울대학교병원', addr: '종로구', lat: 37.5797, lng: 126.999 },
    { name: '서울대학교', addr: '관악구', lat: 37.46, lng: 126.95 },
  ];
  it('왼쪽 위에 [← 뒤로]가 하나, 큰 버튼은 2개', () => {
    const html = render(createElement(PlaceConfirmScreen, { candidates, loading: false, onPick: noop, onBack: noop }));
    expect(count(html, '← 뒤로')).toBe(1);
    expect(bigButtons(html)).toBe(2);
  });
  it('길을 찾는 중에는 뒤로 버튼도 잠근다', () => {
    const html = render(createElement(PlaceConfirmScreen, { candidates, loading: true, onPick: noop, onBack: noop }));
    expect(html).toMatch(/<button[^>]*back-btn[^>]*disabled/);
  });
});

describe('길 고르기', () => {
  const classified = classifyRoutes(parseOdsayResponse(sample))!;
  it('[← 뒤로]가 하나, 큰 버튼은 2개', () => {
    const html = render(createElement(RouteChoiceScreen, { destName: '서울대병원', routes: classified, onPick: noop, onBack: noop }));
    expect(count(html, '← 뒤로')).toBe(1);
    expect(bigButtons(html)).toBe(2);
  });
});

describe('길 안내(걷기·타기) 화면', () => {
  const legs = buildRouteLegs(parseOdsayResponse(sample)[0], { destName: '서울대병원' });
  const binding = { speak: noop, spoken: { has: () => false, add: noop } };
  const props = (session: MultiLegState, onBack?: () => void) => ({
    session,
    binding,
    onBoarded: noop,
    onAlighted: noop,
    onWalkDone: noop,
    onReroute: noop,
    onFinish: noop,
    onBack,
  });
  const screen = (session: MultiLegState, onBack?: () => void) => render(createElement(ActiveGuideScreen, props(session, onBack)));

  /** 안내를 처음부터 끝까지 한 단계씩 넘기며 모든 장면을 모음 */
  function allScenes(): Array<{ label: string; session: MultiLegState }> {
    const scenes: Array<{ label: string; session: MultiLegState }> = [];
    let s = createMultiLegState({ routeId: 'r', destName: '서울대병원', legs, now: T0 }).state;
    scenes.push({ label: '처음', session: s });
    const events = [
      { type: 'WALK_DONE' as const },
      { type: 'BOARDED' as const },
      { type: 'USER_ALIGHTED' as const },
      { type: 'WALK_DONE' as const },
      { type: 'BOARDED' as const },
      { type: 'USER_ALIGHTED' as const },
      { type: 'WALK_DONE' as const },
    ];
    let t = T0;
    for (const e of events) {
      t += 600_000;
      s = multiLegReducer(s, { ...e, now: t }).state;
      scenes.push({ label: `${e.type} 뒤`, session: s });
    }
    return scenes;
  }

  it('안내하는 모든 장면(걷기·타기 전 방향 확인·타는 중·내리는 곳)에 화살표 없는 [뒤로]가 하나 있다', () => {
    const scenes = allScenes().filter((x) => !x.session.finished);
    expect(scenes.length).toBeGreaterThanOrEqual(5);
    for (const { label, session } of scenes) {
      const html = screen(session, noop);
      expect(count(html, '>뒤로<'), label).toBe(1);
      expect(html, label).not.toMatch(NO_ARROW);
    }
  });

  it('뒤로 버튼은 작은 버튼이라 큰 버튼 개수(2개 이하)를 늘리지 않는다', () => {
    for (const { label, session } of allScenes().filter((x) => !x.session.finished)) {
      expect(bigButtons(screen(session, noop)), label).toBe(bigButtons(screen(session)));
      expect(bigButtons(screen(session, noop)), label).toBeLessThanOrEqual(2);
    }
  });

  it('도착한 뒤에는 [처음 화면으로]가 있으므로 뒤로 버튼을 따로 두지 않는다', () => {
    const done = allScenes().find((x) => x.session.finished);
    expect(done).toBeTruthy();
    expect(screen(done!.session, noop)).not.toContain('>뒤로<');
  });

  it('onBack 을 주지 않으면 뒤로 버튼이 없다', () => {
    expect(screen(allScenes()[0].session)).not.toContain('>뒤로<');
  });
});

describe('가족 화면의 방향 보내기 창', () => {
  it('[← 뒤로]가 하나 있고 예전 [닫기]는 없다', () => {
    const html = render(
      createElement(DirectionSender, {
        elder: { lat: 37.58, lng: 127.04, t: T0 },
        dest: { name: '서울대학교병원', lat: 37.5797, lng: 126.999 },
        onSend: noop,
        onClose: noop,
      }),
    );
    expect(count(html, '← 뒤로')).toBe(1);
    expect(html).not.toContain('닫기');
  });
});
