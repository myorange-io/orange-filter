import { describe, expect, test } from 'vitest';
import { countKoreanRatio, pickModel, type ModelTier } from './router';

const noModels = { hasModel: () => false };
const allModels = { hasModel: () => true };
function only(tier: ModelTier) {
  return { hasModel: (t: ModelTier) => t === tier };
}

describe('countKoreanRatio', () => {
  test('빈 문자열은 0', () => {
    expect(countKoreanRatio('')).toBe(0);
  });

  test('순수 영문은 0', () => {
    expect(countKoreanRatio('Hello World')).toBe(0);
  });

  test('순수 한글은 1.0', () => {
    expect(countKoreanRatio('안녕하세요')).toBeCloseTo(1.0);
  });

  test('혼합 50%', () => {
    // "안녕Hi" — 4글자 중 한글 2 → 0.5
    expect(countKoreanRatio('안녕Hi')).toBeCloseTo(0.5);
  });

  test('자모도 포함 (ㄱ-ㅎ, ㅏ-ㅣ)', () => {
    expect(countKoreanRatio('ㄱ나')).toBeCloseTo(1.0);
  });
});

describe('pickModel', () => {
  test('default 모드 + Tier 1만 있음 → tier1-default', () => {
    expect(pickModel('hello', 'default', only('tier1-default'))).toBe('tier1-default');
  });

  test('precision_high 모드 + 정밀 모델 보유 → tier2-precision', () => {
    expect(pickModel('테스트', 'precision_high', allModels)).toBe('tier2-precision');
  });

  test('precision_high 모드인데 정밀 모델 없으면 → tier1-default 폴백', () => {
    expect(pickModel('테스트', 'precision_high', only('tier1-default'))).toBe('tier1-default');
  });

  test('multilingual 모드 + 다국어 모델 + 한글 비율 < 0.4 → tier2-multilingual', () => {
    // 'Hello world 안녕' 대략 한글 2/14 ≈ 0.14
    expect(pickModel('Hello world 안녕', 'multilingual', allModels)).toBe('tier2-multilingual');
  });

  test('multilingual 모드 + 다국어 모델 + 한글 비율 ≥ 0.4 → tier1-default', () => {
    // 한글 비중 높음
    expect(pickModel('안녕하세요 hi', 'multilingual', allModels)).toBe('tier1-default');
  });

  test('multilingual 모델 미보유 → tier1-default 폴백', () => {
    expect(pickModel('Hello', 'multilingual', only('tier1-default'))).toBe('tier1-default');
  });

  test('아무 옵션 모델 없어도 tier1-default 보장', () => {
    expect(pickModel('any', 'default', noModels)).toBe('tier1-default');
  });
});
