import { parseOdsayResponse, OdsayParseError } from '../core/parser/odsayRouteParser';
import type { RouteCandidate } from '../core/types';

/** 프록시(/api/routes/senior) 또는 ODsay 직접 호출. 8초 타임아웃, 오류를 사람이 읽을 수 있는 종류로 나눕니다. */
export const ROUTE_TIMEOUT_MS = 8000;

export const ODSAY_URL = 'https://api.odsay.com/v1/api/searchPubTransPathT';

export type RouteApiErrorKind =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'BAD_RESPONSE'
  | 'NO_ROUTE'
  /** 이 폰에서 하루에 쓸 수 있는 길 찾기 횟수를 다 씀 */
  | 'DAILY_LIMIT';

export class RouteApiError extends Error {
  constructor(readonly kind: RouteApiErrorKind, message: string, readonly retryAfterSec?: number) {
    super(message);
    this.name = 'RouteApiError';
  }
}

export interface Coords { sx: number; sy: number; ex: number; ey: number }

interface RequestOpts {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** 인터넷이 안 될 때 보여 줄 말 */
  networkMessage?: string;
}

async function request(url: string, opts: RequestOpts): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? ROUTE_TIMEOUT_MS);
  try {
    return await f(url, { signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new RouteApiError('TIMEOUT', '길 찾기가 오래 걸리고 있어요. 잠시 후 다시 눌러 주세요.');
    throw new RouteApiError('NETWORK', opts.networkMessage ?? '인터넷 연결을 확인해 주세요.');
  } finally {
    clearTimeout(timer);
  }
}

/** ODsay 형식의 응답(JSON)을 길 후보로 바꿉니다. 프록시·직접 호출·시연용 샘플이 모두 같은 길로 지나갑니다. */
export function routesFromBody(body: unknown): RouteCandidate[] {
  try {
    const routes = parseOdsayResponse(body);
    if (routes.length === 0) throw new RouteApiError('NO_ROUTE', '갈 수 있는 대중교통 길을 찾지 못했어요.');
    return routes;
  } catch (e) {
    if (e instanceof RouteApiError) throw e;
    if (e instanceof OdsayParseError) throw new RouteApiError('NO_ROUTE', e.message);
    throw e;
  }
}

async function readRoutes(res: Response): Promise<RouteCandidate[]> {
  if (res.status === 429) {
    const ra = Number(res.headers.get('Retry-After') ?? '');
    throw new RouteApiError('RATE_LIMITED', '요청이 많아요. 잠시 후 다시 눌러 주세요.', Number.isFinite(ra) ? ra : undefined);
  }
  if (!res.ok) throw new RouteApiError('SERVER', `길 찾기 서버 오류(${res.status})`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new RouteApiError('BAD_RESPONSE', '응답을 읽지 못했어요.');
  }
  return routesFromBody(body);
}

/** 프록시(/api/routes/senior) 호출 */
export async function fetchSeniorRoutes(
  c: Coords,
  opts: { baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RouteCandidate[]> {
  const qs = new URLSearchParams({ sx: String(c.sx), sy: String(c.sy), ex: String(c.ex), ey: String(c.ey) });
  const res = await request(`${opts.baseUrl ?? ''}/api/routes/senior?${qs}`, opts);
  return readRoutes(res);
}

/**
 * 폰의 브라우저에서 ODsay를 바로 부릅니다(프록시 없이). 키는 폰 설정에만 저장되고,
 * ODsay로 보내는 요청 주소에만 들어갑니다. 오류 문구나 화면에는 키를 싣지 않습니다.
 * 미확인: ODsay가 브라우저(다른 주소)에서 온 요청을 받아 주는지(CORS·URI 키 검사)는 실제 키로 시험해 봐야 압니다.
 */
export async function fetchOdsayDirect(
  c: Coords,
  apiKey: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<RouteCandidate[]> {
  const qs = new URLSearchParams({ SX: String(c.sx), SY: String(c.sy), EX: String(c.ex), EY: String(c.ey), apiKey });
  const res = await request(`${ODSAY_URL}?${qs}`, {
    ...opts,
    networkMessage: '길 찾기 서비스에 연결하지 못했어요. 인터넷과 설정의 길 찾기 키를 확인해 주세요.',
  });
  return readRoutes(res);
}

/**
 * GitHub Pages처럼 서버(프록시)가 없는 곳에서는 VITE_STATIC_DEMO=true 로 빌드합니다.
 * 이때 설정에 길 찾기 키가 없으면 시연용 샘플 경로(청량리역 → 서울대병원)를 씁니다.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';
