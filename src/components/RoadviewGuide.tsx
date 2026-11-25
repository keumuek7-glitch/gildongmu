import { useEffect, useRef, useState } from 'react';
import { kakaoReason, loadKakao, showRoadview } from '../services/kakaoMaps';

/** 가족이 보낸 방향 안내 (기존 길동무의 guide 메시지) */
export interface FamilyGuide {
  lat: number;
  lng: number;
  /** 로드뷰를 볼 방향(도) */
  pan: number;
  /** 한 마디 (예: "곧장 가요") */
  phrase: string;
  t: number;
}

export function sanitizeGuide(d: unknown): FamilyGuide | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    pan: Number(o.pan) || 0,
    phrase: String(o.phrase || '곧장 가요').slice(0, 20),
    t: Number(o.t) || Date.now(),
  };
}

/** 가족이 고른 자리·방향의 로드뷰 + 큰 화살표 + 한 마디 */
export function RoadviewGuide(props: {
  guide: FamilyGuide;
  onClose: () => void;
  onCompass?: () => void;
  speak: (t: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('로드뷰 불러오는 중');
  const [hasRv, setHasRv] = useState(false);
  const { guide, speak } = props;

  useEffect(() => {
    let alive = true;
    setHasRv(false);
    setNote('로드뷰 불러오는 중');
    (async () => {
      try { await loadKakao(); } catch { /* 이유는 kakaoReason에서 */ }
      if (!alive || !box.current) return;
      const rv = await showRoadview(box.current, guide, guide.pan);
      if (!alive) return;
      if (rv) setHasRv(true);
      else setNote(kakaoReason());
    })();
    return () => { alive = false; };
  }, [guide]);

  useEffect(() => { speak(guide.phrase); }, [guide, speak]);

  return (
    <div className="rv-guide" role="dialog" aria-label="가족이 보낸 길 안내">
      <button className="btn btn--ghost compass__back" onClick={props.onClose}>← 뒤로</button>
      <div className="rv-guide__box">
        <div ref={box} className="rv-guide__view" />
        {!hasRv && <p className="rv-guide__note">{note}</p>}
        <svg className="rv-guide__arrow" viewBox="0 0 160 260" aria-hidden="true">
          <path d="M80 250 L 80 50" />
          <path d="M30 95 L 80 40 L 130 95" />
        </svg>
      </div>
      <div className="rv-guide__row">
        <p
          className="big rv-guide__phrase"
          tabIndex={0}
          aria-label={`${guide.phrase}. 누르면 다시 읽어 줘요`}
          onClick={() => speak(guide.phrase)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); speak(guide.phrase); } }}
        >
          {guide.phrase}
        </p>
      </div>
      {props.onCompass && <button className="btn btn--primary" onClick={props.onCompass}>나침반</button>}
    </div>
  );
}
