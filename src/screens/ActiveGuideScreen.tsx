import type { ReactNode } from 'react';
import { currentLeg, type MultiLegState } from '../core/stateMachine/multiLegManager';
import { isRideLeg, type RideLeg } from '../core/stateMachine/routeLegBuilder';
import { currentTransitVM, type TransitState } from '../core/stateMachine/transitStateMachine';
import { BoardingDirectionCheck } from '../components/BoardingDirectionCheck';
import { arrivedVM } from '../core/tts/guidanceSpeechBuilder';
import {
  AccessWalkCard,
  ExitGuidanceCard,
  GuidanceBody,
  LineBanner,
  TransferGuidanceCard,
  rideLabel,
  type SpeechBinding,
} from '../components/GuidanceCards';

function RideView(props: {
  leg: RideLeg;
  t: TransitState;
  onBoarded: () => void;
  onAlighted: () => void;
  onReroute: () => void;
  onHelp: () => void;
  speak: (text: string) => void;
}) {
  const { leg, t } = props;
  const vm = currentTransitVM(leg, t);
  return (
    <div className="stack">
      <LineBanner visual={leg.visual} label={rideLabel(leg)} />
      {/* 타기 전 방향 확인은 자기 버튼(2개)만 보여 줍니다 */}
      {t.phase === 'WAITING_BOARDING' ? (
        <BoardingDirectionCheck key={leg.id} leg={leg} onBoarded={props.onBoarded} onHelp={props.onHelp} speak={props.speak} />
      ) : (
        <>
          <GuidanceBody vm={vm} onReplay={() => props.speak(vm.speech)} />
          {t.phase === 'WRONG_DIRECTION_SUSPECTED' ? (
            <button className="btn btn--primary" onClick={props.onReroute}>지금 위치에서 길 다시 찾기</button>
          ) : (
            <button className="btn btn--primary" onClick={props.onAlighted}>내렸어요</button>
          )}
          <button className="btn btn--sos" onClick={props.onHelp}>도움이 필요해요</button>
        </>
      )}
    </div>
  );
}

/**
 * 길 안내 화면. 버튼은 늘 2개 이하: [지금 할 일] + [도움이 필요해요].
 * 안내를 그만두려면 폰의 뒤로 버튼을 눌러요 (확인창이 떠요).
 */
export function ActiveGuideScreen(props: {
  session: MultiLegState;
  binding: SpeechBinding;
  onBoarded: () => void;
  onAlighted: () => void;
  onWalkDone: () => void;
  onReroute: () => void;
  onFinish: () => void;
  onHelp: () => void;
  /** 걷는 구간에서 나침반 열기 */
  onCompass?: (target: { name: string; lat: number; lng: number }) => void;
}) {
  const { session, binding } = props;
  const leg = currentLeg(session);

  let body: ReactNode;
  if (session.finished || !leg) {
    body = (
      <div className="stack">
        <GuidanceBody vm={arrivedVM(session.destName)} />
        <button className="btn btn--primary" onClick={props.onFinish}>처음 화면으로</button>
      </div>
    );
  } else if (isRideLeg(leg) && session.transit) {
    body = (
      <RideView
        leg={leg}
        t={session.transit}
        onBoarded={props.onBoarded}
        onAlighted={props.onAlighted}
        onReroute={props.onReroute}
        onHelp={props.onHelp}
        speak={binding.speak}
      />
    );
  } else if (leg.type === 'TRANSFER_WALK_LEG') {
    const Card = leg.walkKind === 'TRANSFER' ? TransferGuidanceCard : leg.walkKind === 'EXIT' ? ExitGuidanceCard : AccessWalkCard;
    const target = leg.target;
    body = (
      <div className="stack">
        <Card
          key={leg.id}
          leg={leg}
          onDone={props.onWalkDone}
          onCompass={target && props.onCompass ? () => props.onCompass!(target) : undefined}
          {...binding}
        />
        <button className="btn btn--sos" onClick={props.onHelp}>도움이 필요해요</button>
      </div>
    );
  }

  return (
    <main className="screen screen--guide">
      {body}
    </main>
  );
}
