/**
 * 폰의 '뒤로' 버튼을 앱 화면 닫기에 연결하는 작은 스택.
 *
 * 화면을 열 때 push(), 닫을 때 돌려받은 함수를 부르면 됩니다.
 * 사용자가 폰의 뒤로 버튼을 누르면 가장 위(나중에 연 것)의 onBack 이 불립니다.
 * 브라우저 기록을 한 칸씩 쌓고 빼는 일은 여기서만 합니다.
 */
export interface BackEnv {
  /** 브라우저 기록에 한 칸 더함 */
  push(): void;
  /** 브라우저 기록을 한 칸 되돌림 (뒤이어 popstate 가 옴) */
  back(): void;
  /** popstate(뒤로 가기가 일어났을 때) 구독 */
  onPop(cb: () => void): void;
}

export interface BackStack {
  /** 화면을 열 때 부름. 돌려받은 함수를 부르면 '앱이 스스로 닫은' 것으로 기록을 정리함 */
  push(onBack: () => void): () => void;
  readonly size: number;
}

export function createBackStack(env: BackEnv, fallbackMs = 400): BackStack {
  interface Entry { onBack: () => void }
  const stack: Entry[] = [];
  const queue: Array<() => void> = [];
  let busy = false; // 우리가 부른 back() 의 popstate 를 기다리는 중
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    busy = false;
    if (timer) { clearTimeout(timer); timer = null; }
    while (!busy && queue.length) queue.shift()!();
  };
  const startBack = () => {
    busy = true;
    env.back();
    // popstate 가 안 오는 경우를 대비
    timer = setTimeout(flush, fallbackMs);
  };
  const run = (fn: () => void) => {
    if (busy) queue.push(fn);
    else fn();
  };

  env.onPop(() => {
    if (busy) { flush(); return; } // 앱이 스스로 되돌린 것
    const top = stack.pop(); // 사용자가 뒤로 버튼을 누른 것 (기록은 브라우저가 이미 뺌)
    top?.onBack();
  });

  return {
    push(onBack) {
      const entry: Entry = { onBack };
      stack.push(entry);
      run(() => env.push());
      return () => {
        const i = stack.indexOf(entry);
        if (i === -1) return; // 이미 뒤로 버튼으로 닫힘
        const isTop = i === stack.length - 1;
        stack.splice(i, 1);
        // 맨 위가 아니면 브라우저 기록을 건드리지 않음 (엉뚱한 칸을 빼지 않도록)
        if (isTop) run(startBack);
      };
    },
    get size() {
      return stack.length;
    },
  };
}

let singleton: BackStack | null = null;

/** 브라우저용 하나뿐인 스택 */
export function getBackStack(): BackStack {
  if (!singleton) {
    singleton = createBackStack({
      push: () => history.pushState({ gdBack: true }, ''),
      back: () => history.back(),
      onPop: (cb) => window.addEventListener('popstate', cb),
    });
  }
  return singleton;
}
