import { describe, expect, it } from 'vitest';
import { routeKindLabel } from '../src/core/classifier/routeKindLabel';
import {
  MAX_PLACE_CANDIDATES,
  isSameAsPrefilled,
  limitCandidates,
  normalizePlaceText,
} from '../src/core/places/placeInput';
import type { RouteSegment, SegmentMode } from '../src/core/types';

const seg = (mode: SegmentMode): RouteSegment => ({ mode, durationMin: 5, distanceM: 100 });

describe('routeKindLabel', () => {
  it('전철만 타면 "전철"', () => {
    expect(routeKindLabel({ segments: [seg('WALK'), seg('SUBWAY'), seg('WALK')] })).toBe('전철');
  });
  it('버스만 타면 "버스"', () => {
    expect(routeKindLabel({ segments: [seg('WALK'), seg('BUS')] })).toBe('버스');
  });
  it('처음 타는 순서대로 이어 붙임', () => {
    expect(routeKindLabel({ segments: [seg('BUS'), seg('WALK'), seg('SUBWAY')] })).toBe('버스+전철');
    expect(routeKindLabel({ segments: [seg('SUBWAY'), seg('BUS')] })).toBe('전철+버스');
  });
  it('같은 탈것이 여러 번이어도 한 번만', () => {
    expect(routeKindLabel({ segments: [seg('SUBWAY'), seg('BUS'), seg('SUBWAY')] })).toBe('전철+버스');
    expect(routeKindLabel({ segments: [seg('SUBWAY'), seg('WALK'), seg('SUBWAY')] })).toBe('전철');
  });
  it('걷기만 있으면 "걷기" (가까운 곳), 아무것도 없으면 빈 글자', () => {
    expect(routeKindLabel({ segments: [seg('WALK')] })).toBe('걷기');
    expect(routeKindLabel({ segments: [] })).toBe('');
  });
});

describe('normalizePlaceText', () => {
  it('앞뒤 빈칸 제거, 가운데 빈칸은 한 칸', () => {
    expect(normalizePlaceText('  서울대   병원 ')).toBe('서울대 병원');
  });
  it('빈칸뿐이면 빈 글자', () => {
    expect(normalizePlaceText('   \n ')).toBe('');
  });
});

describe('isSameAsPrefilled', () => {
  it('그대로면 true', () => {
    expect(isSameAsPrefilled('서울대학교병원', '서울대학교병원')).toBe(true);
  });
  it('빈칸·대소문자 차이는 무시', () => {
    expect(isSameAsPrefilled(' 서울대학교 병원 ', '서울대학교병원')).toBe(true);
    expect(isSameAsPrefilled('Coex', 'COEX')).toBe(true);
  });
  it('고쳐 썼으면 false', () => {
    expect(isSameAsPrefilled('서울역', '서울대학교병원')).toBe(false);
  });
  it('빈 입력은 미리 써 둔 곳과 같다고 보지 않음', () => {
    expect(isSameAsPrefilled('', '')).toBe(false);
    expect(isSameAsPrefilled('  ', '서울대학교병원')).toBe(false);
  });
});

describe('limitCandidates', () => {
  it('최대 개수까지만 자름', () => {
    const list = Array.from({ length: 10 }, (_, i) => i);
    expect(limitCandidates(list)).toHaveLength(MAX_PLACE_CANDIDATES);
    expect(limitCandidates(list)[0]).toBe(0);
  });
  it('적으면 그대로', () => {
    expect(limitCandidates([1, 2])).toEqual([1, 2]);
  });
});
