import { useState } from 'react';
import type { RideLeg } from '../core/stateMachine/routeLegBuilder';
import { boardingCheckFor } from '../core/safety/directionCheck';

type Step = 'ASK' | 'OK' | 'WRONG';

/**
 * 타기 전 방향 확인 (역방향 예방). 화면의 버튼은 늘 2개 이하입니다.
 * [네, 맞아요] 를 눌러야만 '탔어요' 버튼이 나옵니다.
 * "아니에요"와 "잘 모르겠어요"는 한 버튼으로 합쳐서, 확인되기 전에는 탈 수 없게 했습니다.
 */
export function BoardingDirectionCheck(props: {
  leg: RideLeg;
  onBoarded: () => void;
  onHelp: () => void;
  speak: (t: string) => void;
}) {
  const { leg, speak } = props;
  const c = boardingCheckFor(leg);
  const [step, setStep] = useState<Step>('ASK');
  const boardLabel = leg.type === 'BUS_LEG' ? '버스를 탔어요' : '열차를 탔어요';

  if (step === 'WRONG') {
    return (
      <div className="stack">
        <div className="card card--warning" role="alert">
          <p className="card__title">⛔ {c.wrongTitle}</p>
        </div>
        <button className="btn btn--primary" onClick={() => { setStep('ASK'); speak(c.question); }}>다시 확인하기</button>
        <button className="btn btn--sos" onClick={props.onHelp}>도움이 필요해요</button>
      </div>
    );
  }

  if (step === 'OK') {
    return (
      <div className="stack">
        <p className="check-result check-result--ok">✅ {c.okText}</p>
        <button className="btn btn--primary" onClick={props.onBoarded}>{boardLabel}</button>
        <button className="btn btn--secondary" onClick={() => setStep('ASK')}>다시 확인하기</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card card--alert direction-check">
        <p className="card__title">{c.question}</p>
      </div>
      <button className="btn btn--primary" onClick={() => { setStep('OK'); speak(c.okText); }}>네, 맞아요</button>
      <button
        className="btn btn--secondary"
        onClick={() => { setStep('WRONG'); speak(`${c.wrongTitle}. ${c.wrongLines[0]}`); }}
      >
        아니에요 · 잘 모르겠어요
      </button>
    </div>
  );
}
