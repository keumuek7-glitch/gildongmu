import { useEffect, useRef, useState } from 'react';
import type { RideLeg } from '../core/stateMachine/routeLegBuilder';
import {
  nextAlightStage,
  stageFromFix,
  type AlightAlert,
  type AlightStage,
} from '../core/navigation/proximityAlight';
import { newAwayTracker, trackAway } from '../core/safety/directionCheck';

/**
 * 버스를 탄 동안 GPS로 내릴 정류장까지 거리를 보고 하차 알림을 냅니다.
 * simDistanceM이 있으면(개발자 테스트 패널) GPS 대신 그 거리를 씁니다.
 */
export function useBusProximityAlert(opts: {
  leg: RideLeg | undefined;
  active: boolean;
  nearM: number;
  simDistanceM: number | null;
  onAlert: (alert: AlightAlert, leg: RideLeg) => void;
  /** 내릴 곳에서 계속 멀어질 때 (지나친 것 같음), 구간마다 한 번 */
  onAway?: (leg: RideLeg) => void;
}): { stage: AlightStage; distanceM: number | null } {
  const { leg, active, nearM, simDistanceM } = opts;
  const [stage, setStage] = useState<AlightStage>(0);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const stageRef = useRef<AlightStage>(0);
  const onAlertRef = useRef(opts.onAlert);
  onAlertRef.current = opts.onAlert;
  const onAwayRef = useRef(opts.onAway);
  onAwayRef.current = opts.onAway;
  const away = useRef(newAwayTracker());

  // 구간이 바뀌면 처음부터
  const legId = leg?.id;
  useEffect(() => {
    stageRef.current = 0;
    away.current = newAwayTracker();
    setStage(0);
    setDistanceM(null);
  }, [legId]);

  const apply = (r: { stage: AlightStage; alert: AlightAlert | null }, d: number | null) => {
    if (d != null) {
      setDistanceM(d);
      // 하차 알림 단계와 상관없이 본다: 가까이 갔다가 멀어지면 내릴 곳을 지나친 것
      if (trackAway(away.current, d, leg?.awayMarginM) && leg) onAwayRef.current?.(leg);
    }
    if (r.stage !== stageRef.current) {
      stageRef.current = r.stage;
      setStage(r.stage);
    }
    if (r.alert && leg) onAlertRef.current(r.alert, leg);
  };

  // 시험용 거리
  useEffect(() => {
    if (!active || !leg || simDistanceM == null) return;
    apply(nextAlightStage(stageRef.current, simDistanceM, nearM), simDistanceM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, legId, simDistanceM, nearM]);

  // 실제 GPS
  const target = leg?.alightCoord;
  useEffect(() => {
    if (!active || !leg || !target || simDistanceM != null || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const r = stageFromFix(
          stageRef.current,
          { lat: p.coords.latitude, lng: p.coords.longitude },
          target,
          { accuracyM: p.coords.accuracy, nearM },
        );
        apply(r, r.distanceM);
      },
      () => { /* 권한 없음 등: 정거장 수 안내는 그대로 동작 */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, legId, target?.lat, target?.lng, simDistanceM, nearM]);

  return { stage, distanceM };
}
