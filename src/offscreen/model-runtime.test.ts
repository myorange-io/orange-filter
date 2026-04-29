// mapLabel 매핑 단위 테스트 — Transformers.js 모델 라벨이 우리 PIICategory로 정확히
// 변환되는지 검증. AEGIS PII (Tier 2 precision) 라벨 매핑이 깨지면 한국어 정밀 모드가
// 무용지물이 되므로 회귀 게이트로 lock.

import { describe, expect, it } from 'vitest';
import { mapLabel, mergeAdjacentNames, trimTrailingParticles } from './model-runtime';
import type { PIISpan } from '@/shared/types';

const span = (start: number, end: number, text: string, category: PIISpan['category'] = 'person_name', confidence = 0.9): PIISpan => ({
  start, end, text, category, confidence, source: 'model',
});

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

// AEGIS는 한국어 이름을 SURNAME과 GIVENNAME으로 분리 라벨링 (예: "조성도" → "조"+"성도").
// docs/EVAL_AEGIS_v1.2.md에서 측정된 후처리 규칙을 회귀 lock.
describe('mergeAdjacentNames — SURNAME+GIVENNAME 머지', () => {
  it('직접 인접한 두 person_name → 단일 스팬으로 머지', () => {
    const text = '조성도';
    const out = mergeAdjacentNames([span(0, 1, '조'), span(1, 3, '성도')], text);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '조성도', category: 'person_name' });
  });

  it('1자 gap (공백) 허용 — "김 철수" 형태도 머지', () => {
    const text = '김 철수';
    const out = mergeAdjacentNames([span(0, 1, '김'), span(2, 4, '철수')], text);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: 0, end: 4, text: '김 철수' });
  });

  it('2자 이상 gap → 별도 인물로 유지', () => {
    const text = '김씨와 박씨';
    const out = mergeAdjacentNames([span(0, 2, '김씨'), span(4, 6, '박씨')], text);
    expect(out).toHaveLength(2);
  });

  it('person_name과 다른 카테고리는 머지하지 않음', () => {
    const text = '서울 김철수';
    const out = mergeAdjacentNames(
      [span(0, 2, '서울', 'address'), span(3, 6, '김철수', 'person_name')],
      text,
    );
    expect(out).toHaveLength(2);
  });

  it('빈 입력 → 빈 출력', () => {
    expect(mergeAdjacentNames([], '')).toEqual([]);
  });
});

describe('trimTrailingParticles — 인접 조사/존칭 한 글자 제거', () => {
  it('조사 "의" trim — "김철수의" → "김철수"', () => {
    const text = '김철수의';
    const out = trimTrailingParticles([span(0, 4, '김철수의')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '김철수' });
  });

  it('조사 "가" trim — "조성도가" → "조성도"', () => {
    const text = '조성도가';
    const out = trimTrailingParticles([span(0, 4, '조성도가')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '조성도' });
  });

  it('존칭 "씨" trim — 4자 이상에서만', () => {
    const text = '강현수씨';
    const out = trimTrailingParticles([span(0, 4, '강현수씨')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '강현수' });
  });

  it('3자 이름은 보호 — "김철수"는 그대로', () => {
    const text = '김철수';
    const out = trimTrailingParticles([span(0, 3, '김철수')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '김철수' });
  });

  it('두 글자 trim — "박지영님은" → "박지영"', () => {
    const text = '박지영님은';
    const out = trimTrailingParticles([span(0, 5, '박지영님은')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 3, text: '박지영' });
  });

  it('person_name 외 카테고리는 trim 안 함', () => {
    const text = '서울시의';
    const out = trimTrailingParticles([span(0, 4, '서울시의', 'address')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 4, text: '서울시의' });
  });

  it('마지막이 조사 아님 — 그대로 유지', () => {
    const text = '제갈공명';
    const out = trimTrailingParticles([span(0, 4, '제갈공명')], text);
    expect(out[0]).toMatchObject({ start: 0, end: 4, text: '제갈공명' });
  });
});
