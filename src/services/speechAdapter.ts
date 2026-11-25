import { preprocessForSpeech } from '../core/tts/guidanceSpeechBuilder';

/**
 * 음성 출력 어댑터. 기본은 Web Speech API (ko-KR, rate 0.88).
 * 화면이 백그라운드일 때는 말하지 않고 알림(Notification)·진동으로 대신하고,
 * 마지막 문장을 보관했다가 화면으로 돌아오면 다시 읽습니다(복귀 발화).
 */
export interface SpeechAdapter {
  speak(text: string): void;
  cancel(): void;
  readonly supported: boolean;
}

export function createWebSpeechAdapter(): SpeechAdapter {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  let pending: string | null = null;

  const pickVoice = () => synth?.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ko'));

  // 말소리를 못 내는 브라우저(카톡 안 브라우저 등)면 알림음으로 대신 (기존 길동무와 같음)
  let speechOk: boolean | null = null;
  const speakNow = (text: string) => {
    if (!synth || speechOk === false) { chime(); return; }
    let started = false;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(preprocessForSpeech(text));
      u.lang = 'ko-KR';
      u.rate = 0.88;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.onstart = () => { started = true; speechOk = true; };
      synth.speak(u);
    } catch { /* 아래에서 알림음 */ }
    if (speechOk === true) return;
    // 1.2초 안에 말이 시작되지 않으면 안 되는 것으로 봄
    setTimeout(() => {
      if (started) return;
      speechOk = false;
      chime();
    }, 1200);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && pending) {
        const text = pending;
        pending = null;
        speakNow(`다시 알려 드릴게요. ${text}`);
      }
    });
  }

  return {
    supported: !!synth,
    speak(text: string) {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        pending = text;
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('길동무', { body: text });
          }
        } catch {
          /* 일부 브라우저는 페이지에서 Notification 생성 불가 */
        }
        navigator.vibrate?.([300, 150, 300]);
        return;
      }
      speakNow(text);
    },
    cancel() {
      synth?.cancel();
    },
  };
}

/** 진동 (지원 안 하면 무시) */
export function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}

let audioCtx: AudioContext | null = null;
/** 짧은 알림음 (WebAudio). 말소리를 못 낼 때 대신 씀 */
export function chime(notes: number[] = [660, 880]) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t0 = audioCtx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i === notes.length - 1 ? 0.8 : 0.3));
      o.connect(g).connect(audioCtx!.destination);
      o.start(t);
      o.stop(t + 0.9);
    });
  } catch {
    /* noop */
  }
}
