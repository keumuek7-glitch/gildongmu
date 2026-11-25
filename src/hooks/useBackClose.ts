import { useEffect, useRef } from 'react';
import { getBackStack } from '../services/backStack';

/**
 * open 인 동안 폰의 뒤로 버튼을 가로채 onBack 을 부릅니다.
 * onBack 이 'stay' 를 돌려주면(예: 확인창에서 "아니요") 다시 뒤로 버튼을 가로챕니다.
 */
export function useBackClose(open: boolean, onBack: () => void | 'stay'): void {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let remove: (() => void) | null = null;
    const arm = () => {
      remove = getBackStack().push(() => {
        remove = null;
        const r = latest.current();
        if (r === 'stay' && alive) arm();
      });
    };
    arm();
    return () => {
      alive = false;
      remove?.();
    };
  }, [open]);
}
