import { describe, expect, it } from 'vitest';
import { APP_URL, permissionHelp } from '../src/core/permissionHelp';

describe('위치·방향이 막혔을 때 안내 (어르신은 한 문장, 가족은 순서)', () => {
  it('막힌 게 없으면 아무것도 안 보인다', () => {
    expect(permissionHelp({ gps: false, sensor: false })).toBeNull();
  });

  it('어르신 문장에는 브라우저·설정·센서 같은 어려운 말이 없다', () => {
    for (const p of [
      { gps: true, sensor: false },
      { gps: false, sensor: true },
      { gps: true, sensor: true },
      { gps: false, sensor: false, insecure: true },
    ]) {
      const h = permissionHelp(p)!;
      expect(h.elder).toContain('가족에게 이 화면을 보여 주세요');
      expect(h.elder).not.toMatch(/브라우저|설정|센서|권한/);
    }
  });

  it('위치만 막히면 위치 허용 순서만, 모션 센서 말은 없다', () => {
    const h = permissionHelp({ gps: true, sensor: false })!;
    expect(h.elder).toBe('폰이 위치를 알려 주지 않아요. 가족에게 이 화면을 보여 주세요');
    expect(h.familySteps.join(' ')).toContain('"권한"에 들어가서 "위치" 스위치를 켜');
    expect(h.familySteps.join(' ')).not.toContain('모션 센서');
  });

  it('방향만 막히면 모션 센서 허용 순서', () => {
    const h = permissionHelp({ gps: false, sensor: true })!;
    expect(h.elder).toBe('폰이 방향을 알려 주지 않아요. 가족에게 이 화면을 보여 주세요');
    // 모션 센서는 주소창 "권한" 목록에 없어서 크롬 설정의 사이트 설정으로 안내
    expect(h.familySteps.join(' ')).toContain('"설정", "사이트 설정", "모션 센서" 순서로');
    expect(h.familySteps.join(' ')).not.toContain('"위치" 스위치');
  });

  it('둘 다 막히면 둘 다', () => {
    const h = permissionHelp({ gps: true, sensor: true })!;
    expect(h.elder).toContain('위치와 방향을');
    const all = h.familySteps.join(' ');
    expect(all).toContain('"위치" 스위치를 켜');
    expect(all).toContain('"모션 센서" 순서로');
  });

  it('https 가 아닌 주소면 진짜 앱 주소로 다시 열라고 먼저 알려 준다', () => {
    const h = permissionHelp({ gps: true, sensor: true, insecure: true })!;
    expect(h.elder).toContain('이 주소에서는');
    expect(h.familySteps[0]).toContain(APP_URL);
  });

  it('마지막은 늘 길동무를 다시 열기', () => {
    const h = permissionHelp({ gps: true, sensor: false })!;
    expect(h.familySteps[h.familySteps.length - 1]).toContain('다시 열어');
  });
});
