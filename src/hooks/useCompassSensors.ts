import { useCallback, useEffect, useRef, useState } from 'react';
import { headingFromOrientation, smoothHeading, type LatLng } from '../core/navigation/compass';

interface OrientationEventIOS extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}
type PermissionFn = () => Promise<'granted' | 'denied'>;

/** iOS 13+ 는 방향 센서를 쓰려면 버튼을 눌러 허락을 받아야 합니다. */
export function needsOrientationPermission(): boolean {
  return typeof DeviceOrientationEvent !== 'undefined'
    && typeof (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission === 'function';
}

/**
 * 나침반 화면이 열려 있는 동안 GPS 위치와 휴대폰 방향을 읽습니다.
 * sim이 있으면(시험용) 센서 대신 그 값을 씁니다.
 */
export function useCompassSensors(active: boolean, sim?: { pos: LatLng | null; heading: number | null } | null) {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [needPermit, setNeedPermit] = useState(false);
  const smooth = useRef<{ s: number; c: number } | null>(null);

  const onOrientation = useCallback((e: Event) => {
    const ev = e as OrientationEventIOS;
    const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) || 0;
    const h = headingFromOrientation(ev, angle);
    if (h == null) return;
    const r = smoothHeading(smooth.current, h);
    smooth.current = { s: r.s, c: r.c };
    setHeading(Math.round(r.heading));
  }, []);

  useEffect(() => {
    if (!active) return;
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, onOrientation);
    setNeedPermit(needsOrientationPermission());
    let watch: number | null = null;
    if ('geolocation' in navigator) {
      watch = navigator.geolocation.watchPosition(
        (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsDenied(false); },
        (err) => { if (err.code === 1) setGpsDenied(true); },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
      );
    }
    // 걷는 동안 화면이 꺼지지 않게 (지원하는 브라우저만)
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => {
      window.removeEventListener(evName, onOrientation);
      if (watch != null) navigator.geolocation.clearWatch(watch);
      lock?.release().catch(() => {});
    };
  }, [active, onOrientation]);

  const askPermission = useCallback(async () => {
    const fn = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
    try { await fn?.(); } catch { /* noop */ }
    setNeedPermit(false);
  }, []);

  if (sim) return { pos: sim.pos, heading: sim.heading, gpsDenied: false, needPermit: false, askPermission };
  return { pos, heading, gpsDenied, needPermit: needPermit && heading == null, askPermission };
}
