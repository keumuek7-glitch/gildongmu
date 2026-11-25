import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompassView } from '../src/components/CompassView';

const target = { name: '청량리', lat: 37.58, lng: 127.047 };
const noop = () => {};
const render = (onRoadview?: () => void) =>
  renderToStaticMarkup(createElement(CompassView, { target, onClose: noop, onArrived: noop, onRoadview }));
const count = (html: string, text: string) => html.split(text).length - 1;

describe('나침반 화면에는 늘 [← 뒤로]가 하나 있다', () => {
  it('로드뷰가 없을 때: 아래 [도착했어요] 옆에 하나', () => {
    const html = render();
    expect(count(html, '← 뒤로')).toBe(1);
    expect(html).not.toContain('compass__back');
  });
  it('로드뷰가 있을 때: [로드뷰]가 자리를 쓰므로 왼쪽 위에 작은 [← 뒤로]가 하나', () => {
    const html = render(noop);
    expect(count(html, '← 뒤로')).toBe(1);
    expect(html).toContain('compass__back');
    expect(html).toContain('로드뷰');
  });
});
