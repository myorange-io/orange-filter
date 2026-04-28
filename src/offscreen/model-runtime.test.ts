// mapLabel 매핑 단위 테스트 — Transformers.js 모델 라벨이 우리 PIICategory로 정확히
// 변환되는지 검증. AEGIS PII (Tier 2 precision) 라벨 매핑이 깨지면 한국어 정밀 모드가
// 무용지물이 되므로 회귀 게이트로 lock.

import { describe, expect, it } from 'vitest';
import { mapLabel } from './model-runtime';

describe('mapLabel — Transformers.js 라벨 → PIICategory', () => {
  it('BIO prefix 제거 (B-/I-/E-/S-)', () => {
    expect(mapLabel('B-PER')).toBe('person_name');
    expect(mapLabel('I-PER')).toBe('person_name');
    expect(mapLabel('E-ORG')).toBe('organization');
    expect(mapLabel('S-LOC')).toBe('address');
  });

  it('Tier 1 (bert-base-NER): PER/ORG/LOC/DATE', () => {
    expect(mapLabel('PER')).toBe('person_name');
    expect(mapLabel('ORG')).toBe('organization');
    expect(mapLabel('LOC')).toBe('address');
    expect(mapLabel('DATE')).toBe('date');
    expect(mapLabel('MISC')).toBeNull(); // 미매핑
  });

  it('AEGIS PII: 인명 (GIVENNAME, SURNAME)', () => {
    expect(mapLabel('GIVENNAME')).toBe('person_name');
    expect(mapLabel('SURNAME')).toBe('person_name');
    expect(mapLabel('B-SURNAME')).toBe('person_name');
  });

  it('AEGIS PII: 한국 PII 직접 라벨', () => {
    expect(mapLabel('IDCARD')).toBe('rrn'); // 주민등록번호
    expect(mapLabel('DRIVERLICENSENUM')).toBe('driver_license');
    expect(mapLabel('CREDITCARDNUMBER')).toBe('card');
    expect(mapLabel('ACCOUNTNUM')).toBe('account');
    expect(mapLabel('PASSWORD')).toBe('credential');
  });

  it('AEGIS PII: 연락 (EMAIL, TELEPHONENUM)', () => {
    expect(mapLabel('EMAIL')).toBe('email');
    expect(mapLabel('TELEPHONENUM')).toBe('mobile');
    expect(mapLabel('B-TELEPHONENUM')).toBe('mobile');
  });

  it('AEGIS PII: 주소 (STREET, CITY, ZIPCODE, BUILDINGNUM)', () => {
    expect(mapLabel('STREET')).toBe('address');
    expect(mapLabel('CITY')).toBe('address');
    expect(mapLabel('ZIPCODE')).toBe('address');
    expect(mapLabel('BUILDINGNUM')).toBe('address');
  });

  it('AEGIS PII: 조직 (COMPANY)', () => {
    expect(mapLabel('COMPANY')).toBe('organization');
  });

  it('AEGIS PII: 시간 (TIME, DATEOFBIRTH)', () => {
    expect(mapLabel('TIME')).toBe('date');
    expect(mapLabel('DATEOFBIRTH')).toBe('date');
  });

  it('미매핑 라벨 (IP_ADDRESS, USERNAME) → null', () => {
    expect(mapLabel('IP_ADDRESS')).toBeNull();
    expect(mapLabel('USERNAME')).toBeNull();
    expect(mapLabel('UNKNOWN')).toBeNull();
    expect(mapLabel('O')).toBeNull(); // BIO Outside
  });
});
