import { Fragment, useState } from 'react';
import type { RideLeg, WalkLeg } from '../core/stateMachine/routeLegBuilder';
import type { StationExitGuide } from '../core/metadata/stationTransferMetadata';
import { walkVM, type GuidanceViewModel } from '../core/tts/guidanceSpeechBuilder';
import { useCardAutoSpeech } from '../hooks/useCardAutoSpeech';
import type { LineVisual } from '../core/metadata/subwayLineVisuals';
import { transferCheckFor } from '../core/safety/directionCheck';
import { DirectionCheck } from './BoardingDirectionCheck';
import { routeStripStops, stripLineLabel } from '../core/stateMachine/routeStrip';

export interface SpeechBinding {
  speak: (text: string) => void;
  spoken: { has(k: string): boolean; add(k: string): void };
}

/** 노선 고유색 배너 (예: 초록색 2호선). label 이 없으면 색만 보이는 띠 */
export function LineBanner({ visual, label }: { visual: LineVisual; label?: string }) {
  return (
    <div
      className={`line-banner ${label ? '' : 'line-banner--bar'}`}
      style={{ background: visual.bgHex, color: visual.textHex }}
      aria-label={label || undefined}
    >
      {label && <span className="line-banner__label">{label}</span>}
    </div>
  );
}

/**
 * 큰 노선 띠: 화면 아래쪽에 노선 색으로 크게 노선 이름, 그 아래 [타는 곳 / 다음 / 내리는 곳]을 위에서 아래로.
 * 가로 화살표(➡)는 쓰지 않아요. 열차가 들어오는 쪽이 서 있는 자리마다 달라서 폰의 화살표와 어긋날 수 있어서예요.
 * 버튼이 아니라 글자만 있는 띠라서 화면의 버튼 수에는 들어가지 않아요.
 */
/** compact: 질문·버튼이 길게 나오는 확인 화면에서 한 화면에 더 들어오도록 글자를 조금 줄인 모양 */
export function RouteStrip({ leg, compact }: { leg: RideLeg; compact?: boolean }) {
  const line = stripLineLabel(leg);
  const stops = routeStripStops(leg);
  return (
    <section
      className={`route-strip${compact ? ' route-strip--compact' : ''}`}
      style={{ background: leg.visual.bgHex, color: leg.visual.textHex }}
      aria-label={`${line}: ${stops.map((s) => `${s.label} ${s.name}`).join(', ')}`}
    >
      <p className="route-strip__line">{line}</p>
      <dl className="route-strip__stops">
        {stops.map((s) => (
          <Fragment key={s.role}>
            <dt className="route-strip__label">{s.label}</dt>
            <dd className="route-strip__stop">{s.name}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function rideLabel(leg: RideLeg): string {
  return leg.type === 'BUS_LEG' ? `${leg.busNo ?? ''}번 버스` : leg.lineKey;
}

/**
 * 공통 카드 본문: 큰 글자 한 문장(제목)만 보여 줍니다. 소리는 자세한 설명까지 읽어 줍니다.
 * 버튼이 아니라 카드를 누르면 다시 읽어 줍니다 (화면의 버튼 수를 줄이기 위해).
 */
export function GuidanceBody({ vm, onReplay }: { vm: GuidanceViewModel; onReplay?: () => void }) {
  const press = onReplay
    ? {
        onClick: onReplay,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onReplay();
          }
        },
        'aria-label': `${vm.title}. 누르면 다시 읽어 줘요`,
      }
    : {};
  return (
    <section className={`card card--${vm.tone} ${onReplay ? 'card--tap' : ''}`} aria-live="polite" {...press}>
      <h1 className="card__title">{vm.title}</h1>
    </section>
  );
}

interface WalkCardProps extends SpeechBinding {
  leg: WalkLeg;
  onDone: () => void;
  /** 가는 곳 좌표가 있으면: 큰 버튼이 [나침반으로 가기]가 되고, 도착은 나침반 화면에서 눌러요 */
  onCompass?: () => void;
}

/** 걷는 구간의 큰 버튼 하나: 나침반으로 가기(있으면) 또는 도착 확인 */
function WalkMainButton(props: { onDone: () => void; onCompass?: () => void; doneLabel: string }) {
  return props.onCompass ? (
    <button className="btn btn--primary" onClick={props.onCompass}>🧭 나침반으로 가기</button>
  ) : (
    <button className="btn btn--primary" onClick={props.onDone}>{props.doneLabel}</button>
  );
}

/** 환승 도보 카드: 다음 노선 색 배너 + 승강기 동선. 진입 시 스스로 1회 읽음 */
function TransferWalkBody({ leg, onDone, onCompass, speak, spoken }: WalkCardProps) {
  const vm = walkVM(leg);
  const replay = useCardAutoSpeech(`${leg.id}:CARD`, vm.speech, speak, spoken);
  return (
    <div className="stack stack--fill">
      <GuidanceBody vm={vm} onReplay={replay} />
      <WalkMainButton onDone={onDone} onCompass={onCompass} doneLabel="다 왔어요" />
      {leg.nextRide && <RouteStrip leg={leg.nextRide} />}
    </div>
  );
}

/** 전철 1차 확인: "○○방면으로 걸어가고 있나요?" 처음 한 번 소리로도 물어봅니다. */
function TransferDirectionAsk(props: SpeechBinding & { next: RideLeg; legId: string; onYes: () => void }) {
  const check = transferCheckFor(props.next);
  useCardAutoSpeech(`${props.legId}:DIRCHECK`, check.question, props.speak, props.spoken);
  return (
    <div className="stack stack--fill">
      <DirectionCheck check={check} speak={props.speak} onConfirm={props.onYes} />
      <RouteStrip leg={props.next} compact />
    </div>
  );
}

/**
 * 환승 구간. 갈아탈 것이 전철이면 먼저 "○○방면으로 걸어가고 있나요?"(1차 확인)를 묻고,
 * [네, 맞아요]를 누르면 걷는 안내 카드로 넘어갑니다. 아니오·잘 몰라요면 왔던 길로 돌아가라고 안내해요.
 */
export function TransferGuidanceCard(props: WalkCardProps) {
  const next = props.leg.nextRide;
  const [checked, setChecked] = useState(false);
  if (next?.type === 'SUBWAY_LEG' && !checked) {
    return (
      <TransferDirectionAsk
        next={next}
        legId={props.leg.id}
        speak={props.speak}
        spoken={props.spoken}
        onYes={() => setChecked(true)}
      />
    );
  }
  return <TransferWalkBody {...props} />;
}

/** 노란 큰 글자 한 문장: 몇 번 출구로 나가는지 (누르면 다시 읽어 줘요) */
function ExitNumberCard({ guide, onReplay }: { guide: StationExitGuide; onReplay: () => void }) {
  const sentence = `${guide.exitNo}번 출구로 나가요`;
  return (
    <section
      className="card card--exit card--tap"
      aria-live="polite"
      aria-label={`${sentence}. 누르면 다시 읽어 줘요`}
      tabIndex={0}
      onClick={onReplay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onReplay();
        }
      }}
    >
      <h1 className="card__title">{sentence}</h1>
    </section>
  );
}

/** 엘리베이터 / 계단·에스컬레이터 중 어느 길로 나갈지 고르는 화면 (버튼 2개) */
function ExitChoiceCard(props: SpeechBinding & { leg: WalkLeg; onPick: (kind: 'elevator' | 'stairs') => void }) {
  const { leg } = props;
  const question = '어느 길로 나갈까요?';
  const replay = useCardAutoSpeech(`${leg.id}:EXITCHOICE`, '어느 길로 나갈까요? 엘리베이터, 또는 계단이나 에스컬레이터를 골라 주세요', props.speak, props.spoken);
  return (
    <div className="stack">
      <section className="card card--normal card--tap" tabIndex={0} aria-label={`${question} 누르면 다시 읽어 줘요`} onClick={replay}>
        <h1 className="card__title">{question}</h1>
      </section>
      <button className="btn btn--primary" onClick={() => props.onPick('elevator')}>🛗 엘리베이터</button>
      <button className="btn btn--secondary" onClick={() => props.onPick('stairs')}>🪜 계단 · 에스컬레이터</button>
    </div>
  );
}

/** 고른 길의 출구 번호(노란 한 문장) + 걷기 버튼 */
function ExitRouteCard(props: WalkCardProps & { guide: StationExitGuide; kind: 'elevator' | 'stairs' | 'only'; onChange?: () => void }) {
  const { leg, guide } = props;
  const vm = walkVM({ ...leg, exitGuide: guide });
  const replay = useCardAutoSpeech(`${leg.id}:CARD:${props.kind}`, vm.speech, props.speak, props.spoken);
  return (
    <div className="stack">
      <ExitNumberCard guide={guide} onReplay={replay} />
      <WalkMainButton onDone={props.onDone} onCompass={props.onCompass} doneLabel="목적지에 도착했어요" />
      {props.onChange && (
        <button className="btn btn--secondary" onClick={props.onChange}>
          {props.kind === 'elevator' ? '🪜 계단으로' : '🛗 엘리베이터로'}
        </button>
      )}
    </div>
  );
}

/**
 * 출구 안내 카드 (마지막 하차 → 목적지).
 * - 엘리베이터 길과 계단·에스컬레이터 길이 둘 다 있으면 먼저 고르게 하고,
 * - 하나뿐이면 바로 노란 출구 번호 한 문장을 보여 주고,
 * - 출구 자료가 없으면 예전처럼 "목적지까지 걸어가요" 한 문장을 보여 줍니다.
 */
export function ExitGuidanceCard(props: WalkCardProps) {
  const { leg } = props;
  const [picked, setPicked] = useState<'elevator' | 'stairs' | null>(null);
  const opts = leg.exitOptions;
  const both = !!(opts?.elevator && opts?.stairs);

  if (both && picked === null) return <ExitChoiceCard {...props} onPick={setPicked} />;
  if (both && picked) {
    return (
      <ExitRouteCard {...props} guide={opts![picked]!} kind={picked} onChange={() => setPicked(picked === 'elevator' ? 'stairs' : 'elevator')} />
    );
  }
  const only = opts?.elevator ?? opts?.stairs ?? leg.exitGuide;
  if (only) return <ExitRouteCard {...props} guide={only} kind="only" />;

  return <ExitPlainCard {...props} />;
}

/** 출구 자료가 없을 때: "목적지까지 걸어가요" 한 문장 */
function ExitPlainCard({ leg, onDone, onCompass, speak, spoken }: WalkCardProps) {
  const vm = walkVM(leg);
  const replay = useCardAutoSpeech(`${leg.id}:CARD`, vm.speech, speak, spoken);
  return (
    <div className="stack">
      <GuidanceBody vm={vm} onReplay={replay} />
      <WalkMainButton onDone={onDone} onCompass={onCompass} doneLabel="목적지에 도착했어요" />
    </div>
  );
}

/** 출발지 → 첫 탑승 지점 도보 */
export function AccessWalkCard({ leg, onDone, onCompass, speak, spoken }: WalkCardProps) {
  const vm = walkVM(leg);
  const replay = useCardAutoSpeech(`${leg.id}:CARD`, vm.speech, speak, spoken);
  return (
    <div className="stack stack--fill">
      <GuidanceBody vm={vm} onReplay={replay} />
      <WalkMainButton onDone={onDone} onCompass={onCompass} doneLabel="타는 곳에 왔어요" />
      {leg.nextRide && <RouteStrip leg={leg.nextRide} />}
    </div>
  );
}
