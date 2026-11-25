import { DailyLimit } from './dailyLimit';
import { gdStore } from './familyRelayClient';
import { STATIC_DEMO } from './routeApiClient';
import { RouteCache } from './routeCache';
import { createRouteService, pickProvider } from './routeService';

/** 앱이 실제로 쓰는 길 찾기(폰의 저장소 사용). 순수 로직은 routeService.ts 에 있습니다. */
export const routeCache = new RouteCache(gdStore);
export const dailyLimit = new DailyLimit(gdStore);

/** 길 찾기(ODsay) 키. 이 폰의 설정에만 저장되고, 가족 연결·공유 링크에는 들어가지 않습니다. */
export const getOdsayKey = (): string => gdStore.get('odsayKey', '');
export function setOdsayKey(k: string): void {
  const v = k.trim();
  if (v) gdStore.set('odsayKey', v);
  else gdStore.del('odsayKey');
}

export const routeService = createRouteService({
  getProvider: () => pickProvider({ odsayKey: getOdsayKey(), staticDemo: STATIC_DEMO }),
  cache: routeCache,
  limit: dailyLimit,
});
