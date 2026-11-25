import { useState } from 'react';
import type { RideLeg } from '../core/stateMachine/routeLegBuilder';
import { boardingCheckFor, type BoardingCheck } from '../core/safety/directionCheck';

type Step = 'ASK' | 'OK' | 'WRONG';

/** 질문을 다시 읽어 줄 때: 질문 + (있으면) 이름으로 확인하라는 한 줄 */
const askSpeech = (c: BoardingCheck) => (c.hint ? `${c.question}. ${c.hint}` : c.question);

/**
 * 방향 확인 한 단계 (역방향 예방). 화면의 버튼은 늘 2개 이하입니다.
 *  - [맞아요] 쪽을 눌러야만 다음으로 갑니다.
 *  - "아니오"와 "잘 몰라요"는 한 버튼으로 합쳐서, 확인되기 전에는 갈 수 없게 했습니다.
 *    누르면 왔던 길로 돌아가 그 방면으로 가라는 한 문장을 보여 주고 [다시 확인하기]만 둡니다.
 * confirmLabel 이 있으면: [맞아요] → "맞아요. 타세요" + [confirmLabel] 로 한 번 더 누르게 합니다(타기 전 확인).
 * confirmLabel 이 없으면: [맞아요]를 누르면 바로 onConfirm (걸으면서 하는 1차 확인).
 */
export function DirectionCheck(props: {
  check: BoardingCheck;
  speak: (t: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const { check: c, speak } = props;
  const [step, setStep] = useState<Step>('ASK');

  if (step === 'WRONG') {
    return (
      <div className="stack">
        <div className="card card--warning" role="alert">
          <p className="card__title">⛔ {c.wrongTitle}</p>
        </div>
        <button className="btn btn--primary" onClick={() => { setStep('ASK'); speak(askSpeech(c)); }}>다시 확인하기</button>
      </div>
    );
  }

  if (step === 'OK' && props.confirmLabel) {
    return (
      <div className="stack">
        <p className="check-result check-result--ok">✅ {c.okText}</p>
        <button className="btn btn--primary" onClick={props.onConfirm}>{props.confirmLabel}</button>
        <button className="btn btn--secondary" onClick={() => setStep('ASK')}>다시 확인하기</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className={`card card--alert direction-check${c.question.length > 30 ? ' direction-check--long' : ''}`}>
        <p className="card__title">{c.question}</p>
        {c.hint && <p className="direction-check__hint">{c.hint}</p>}
      </div>
      <button
        className="btn btn--primary"
        onClick={() => {
          if (props.confirmLabel) {
            setStep('OK');
            speak(c.okText);
          } else {
            props.onConfirm();
          }
        }}
      >
        {c.yesLabel}
      </button>
      <button
        className="btn btn--secondary"
        onClick={() => { setStep('WRONG'); speak(`${c.wrongTitle}. ${c.wrongLines[0]}`); }}
      >
        {c.noLabel}
      </button>
    </div>
  );
}

/** 타기 전 방향 확인 (전철 승강장 2차 / 버스 정류장에서 기사님께 확인). 확인된 뒤에만 [탔어요]가 나옵니다. */
export function BoardingDirectionCheck(props: {
  leg: RideLeg;
  onBoarded: () => void;
  speak: (t: string) => void;
}) {
  const { leg } = props;
  return (
    <DirectionCheck
      check={boardingCheckFor(leg)}
      speak={props.speak}
      onConfirm={props.onBoarded}
      confirmLabel={leg.type === 'BUS_LEG' ? '버스를 탔어요' : '열차를 탔어요'}
    />
  );
}
