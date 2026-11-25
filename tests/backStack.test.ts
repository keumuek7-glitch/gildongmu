import { describe, expect, it } from 'vitest';
import { createBackStack, type BackEnv } from '../src/services/backStack';

/** 브라우저 기록을 흉내 내는 가짜: back() 하면 잠시 뒤 popstate 가 옴 */
function fakeEnv() {
  let depth = 0;
  let popCb: () => void = () => {};
  const env: BackEnv = {
    push: () => { depth++; },
    back: () => {
      depth--;
      queueMicrotask(() => popCb());
    },
    onPop: (cb) => { popCb = cb; },
  };
  /** 사용자가 폰의 뒤로 버튼을 누름 */
  const pressBack = () => {
    depth--;
    popCb();
  };
  return { env, pressBack, depth: () => depth };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('backStack: 폰 뒤로 버튼', () => {
  it('뒤로 버튼을 누르면 가장 위 화면의 onBack 만 불린다', () => {
    const f = fakeEnv();
    const s = createBackStack(f.env);
    const calls: string[] = [];
    s.push(() => calls.push('A'));
    s.push(() => calls.push('B'));
    expect(f.depth()).toBe(2);
    f.pressBack();
    expect(calls).toEqual(['B']);
    f.pressBack();
    expect(calls).toEqual(['B', 'A']);
    expect(s.size).toBe(0);
  });

  it('앱이 스스로 닫으면 기록을 한 칸 되돌리고 onBack 은 부르지 않는다', async () => {
    const f = fakeEnv();
    const s = createBackStack(f.env);
    const calls: string[] = [];
    const close = s.push(() => calls.push('A'));
    close();
    await tick();
    expect(f.depth()).toBe(0);
    expect(calls).toEqual([]);
    expect(s.size).toBe(0);
  });

  it('스스로 닫은 직후 바로 새 화면을 열어도 기록이 어긋나지 않는다 (길 고르기 → 길 안내)', async () => {
    const f = fakeEnv();
    const s = createBackStack(f.env);
    const calls: string[] = [];
    const closeChoice = s.push(() => calls.push('choice'));
    closeChoice();
    s.push(() => calls.push('guide')); // 같은 순간에 새 화면
    await tick();
    expect(f.depth()).toBe(1);
    f.pressBack();
    expect(calls).toEqual(['guide']);
    expect(f.depth()).toBe(0);
  });

  it('뒤로 버튼으로 이미 닫힌 화면의 정리 함수는 아무 일도 하지 않는다', async () => {
    const f = fakeEnv();
    const s = createBackStack(f.env);
    const close = s.push(() => {});
    f.pressBack();
    close();
    await tick();
    expect(f.depth()).toBe(0);
  });

  it('맨 위가 아닌 화면을 닫을 때는 브라우저 기록을 건드리지 않는다', async () => {
    const f = fakeEnv();
    const s = createBackStack(f.env);
    const closeA = s.push(() => {});
    s.push(() => {});
    closeA();
    await tick();
    expect(f.depth()).toBe(2);
    expect(s.size).toBe(1);
  });
});
