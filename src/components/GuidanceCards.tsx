import type { RideLeg, WalkLeg } from '../core/stateMachine/routeLegBuilder';
import { walkVM, type GuidanceViewModel } from '../core/tts/guidanceSpeechBuilder';
import { useCardAutoSpeech } from '../hooks/useCardAutoSpeech';
import type { LineVisual } from '../core/metadata/subwayLineVisuals';

export interface SpeechBinding {
  speak: (text: string) => void;
  spoken: { has(k: string): boolean; add(k: string): void };
}

/** 노선 고유색 배너 (예: 초록색 2호선) */
export function LineBanner({ visual, label }: { visual: LineVisual; label: string }) {
  return (
    <div className="line-banner" style={{ background: visual.bgHex, color: visual.textHex }}>
      <span className="line-banner__label">{label}</span>
      {visual.colorName && <span className="line-banner__color">{visual.colorName}</span>}
    </div>
  );
}

export function rideLabel(leg: RideLeg): string {
  return leg.type === 'BUS_LEG' ? `${leg.busNo ?? ''}번 버스` : leg.lineKey;
}

/**
 * 공통 카드 본문. 버튼이 아니라 카드를 누르면 다시 읽어 줍니다 (화면의 버튼 수를 줄이기 위해).
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
      <ul className="card__lines">
        {vm.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {onReplay && <p className="card__hint">🔊 글자를 누르면 다시 읽어요</p>}
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
export function TransferGuidanceCard({ leg, onDone, onCompass, speak, spoken }: WalkCardProps) {
  const vm = walkVM(leg);
  const replay = useCardAutoSpeech(`${leg.id}:CARD`, vm.speech, speak, spoken);
  return (
    <div className="stack">
      {leg.nextRide && <LineBanner visual={leg.nextRide.visual} label={`${rideLabel(leg.nextRide)} 타는 곳으로`} />}
      <GuidanceBody vm={vm} onReplay={replay} />
      {leg.railGuide?.quickDoor && (
        <p className="hint">빠른 환승 문: <strong>{leg.railGuide.quickDoor}</strong></p>
      )}
      <WalkMainButton onDone={onDone} onCompass={onCompass} doneLabel="다 왔어요 (타는 곳 도착)" />
    </div>
  );
}

/** 출구 안내 카드 (마지막 하차 → 목적지) */
export function ExitGuidanceCard({ leg, onDone, onCompass, speak, spoken }: WalkCardProps) {
  const vm = walkVM(leg);
  const replay = useCardAutoSpeech(`${leg.id}:CARD`, vm.speech, speak, spoken);
  return (
    <div className="stack">
      {leg.exitGuide && (
        <div className="exit-badge" aria-label={`${leg.exitGuide.exitNo}번 출구`}>
          {leg.exitGuide.exitNo}
          <small>번 출구</small>
        </div>
      )}
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
    <div className="stack">
      {leg.nextRide && <LineBanner visual={leg.nextRide.visual} label={`${rideLabel(leg.nextRide)} 타러 가요`} />}
      <GuidanceBody vm={vm} onReplay={replay} />
      <WalkMainButton onDone={onDone} onCompass={onCompass} doneLabel="타는 곳에 왔어요" />
    </div>
  );
}
