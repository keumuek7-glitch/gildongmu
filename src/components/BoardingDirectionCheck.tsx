import { useState } from 'react';
import type { RideLeg } from '../core/stateMachine/routeLegBuilder';
import { boardingCheckFor } from '../core/safety/directionCheck';

type Step = 'ASK' | 'OK' | 'WRONG' | 'UNSURE';

/**
 * 타기 전 방향 확인 (역방향 탑승 예방).
 * "네"나 "잘 모르겠어요"(물어보기 안내 후)를 눌러야 '탔어요' 버튼이 나옵니다.
 */
export function BoardingDirectionCheck(props: { leg: RideLeg; onBoarded: () => void; speak: (t: string) => void }) {
  const { leg, speak } = props;
  const c = boardingCheckFor(leg);
  const [step, setStep] = useState<Step>('ASK');
  const boardLabel = leg.type === 'BUS_LEG' ? '버스를 탔어요' : '열차를 탔어요';

  if (step === 'WRONG') {
    return (
      <div className="card card--warning" role="alert">
        <p className="card__title">⛔ {c.wrongTitle}</p>
        <ul className="card__lines">{c.wrongLines.map((l) => <li key={l}>{l}</li>)}</ul>
        <button className="btn btn--primary" onClick={() => { setStep('ASK'); speak(c.question); }}>다시 확인하기</button>
      </div>
    );
  }

  if (step === 'OK' || step === 'UNSURE') {
    return (
      <div className="stack">
        <p className={`check-result ${step === 'OK' ? 'check-result--ok' : ''}`}>
          {step === 'OK' ? `✅ ${c.okText}` : c.unsureLines[0]}
        </p>
        <button className="btn btn--primary" onClick={props.onBoarded}>{boardLabel}</button>
        <button className="btn btn--ghost" onClick={() => setStep('ASK')}>다시 확인하기</button>
      </div>
    );
  }

  return (
    <div className="card card--alert direction-check">
      <p className="card__title">타기 전에 방향을 확인해요</p>
      <p className="direction-check__look">{c.lookFor}</p>
      <p>{c.question}</p>
      <div className="direction-check__answers">
        <button className="btn btn--primary" onClick={() => { setStep('OK'); speak(c.okText); }}>네, 맞아요</button>
        <button
          className="btn btn--secondary"
          onClick={() => { setStep('WRONG'); speak(`${c.wrongTitle}. ${c.wrongLines[0]}`); }}
        >
          아니요
        </button>
      </div>
      <button className="btn btn--ghost" onClick={() => { setStep('UNSURE'); speak(c.unsureLines[0]); }}>잘 모르겠어요</button>
    </div>
  );
}
