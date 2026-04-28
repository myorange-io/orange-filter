import { describe, expect, test } from 'vitest';
import { mergeSpans } from './merge';
import type { PIISpan } from '@/shared/types';

function span(
  start: number,
  end: number,
  category: PIISpan['category'],
  source: PIISpan['source'],
  confidence = 0.95,
  text = '',
): PIISpan {
  return { start, end, text: text || `[${start}-${end}]`, category, confidence, source };
}

describe('mergeSpans', () => {
  test('정규식만 있을 때 그대로 반환', () => {
    const regex = [span(0, 5, 'rrn', 'regex')];
    expect(mergeSpans(regex, [])).toEqual(regex);
  });

  test('모델만 있을 때 그대로 반환', () => {
    const model = [span(10, 20, 'person_name', 'model', 0.9)];
    expect(mergeSpans([], model)).toEqual(model);
  });

  test('정규식과 동일 위치 모델 스팬은 폐기 (정규식 우선)', () => {
    const regex = [span(0, 13, 'rrn', 'regex', 0.99)];
    const model = [span(0, 13, 'rrn', 'model', 0.85)];
    const result = mergeSpans(regex, model);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('regex');
  });

  test('정규식과 IoU 50% 이상 겹치는 모델 스팬은 폐기', () => {
    // 정규식 [0,10] vs 모델 [3,12] → IoU = 7/12 ≈ 0.58
    const regex = [span(0, 10, 'mobile', 'regex')];
    const model = [span(3, 12, 'mobile', 'model', 0.9)];
    const result = mergeSpans(regex, model);
    expect(result).toEqual(regex);
  });

  test('정규식과 살짝 겹치는 모델 스팬(IoU < 0.5)은 둘 다 유지', () => {
    // 정규식 [0,10] vs 모델 [8,20] → IoU = 2/20 = 0.1
    const regex = [span(0, 10, 'mobile', 'regex')];
    const model = [span(8, 20, 'address', 'model', 0.9)];
    const result = mergeSpans(regex, model);
    expect(result).toHaveLength(2);
  });

  test('서로 안 겹치는 정규식+모델 스팬은 start 정렬해서 둘 다 유지', () => {
    const regex = [span(50, 60, 'email', 'regex')];
    const model = [span(0, 10, 'person_name', 'model', 0.9)];
    const result = mergeSpans(regex, model);
    expect(result.map((s) => s.start)).toEqual([0, 50]);
  });

  test('모델 스팬끼리 IoU ≥ 0.5 겹치면 confidence 높은 쪽만 유지', () => {
    const model = [
      span(0, 10, 'person_name', 'model', 0.8),
      span(2, 11, 'person_name', 'model', 0.95), // confidence 더 높음
    ];
    const result = mergeSpans([], model);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.95);
  });

  test('동일 키(start,end,category) 중복 폐기', () => {
    const regex = [span(0, 10, 'mobile', 'regex')];
    const model = [span(0, 10, 'mobile', 'model', 0.9)];
    const result = mergeSpans(regex, model);
    expect(result).toHaveLength(1);
    expect(result[0]!.source).toBe('regex');
  });

  test('빈 입력', () => {
    expect(mergeSpans([], [])).toEqual([]);
  });

  test('정규식 다수 + 모델 다수 — 일부만 살아남음', () => {
    const regex = [
      span(0, 13, 'rrn', 'regex', 0.99),
      span(20, 33, 'mobile', 'regex', 0.95),
    ];
    const model = [
      span(0, 13, 'rrn', 'model', 0.7), // 정규식과 동일 → 폐기
      span(40, 50, 'person_name', 'model', 0.92), // 신규 → 유지
      span(20, 33, 'mobile', 'model', 0.88), // 정규식과 IoU=1 → 폐기
      span(60, 75, 'address', 'model', 0.85), // 신규 → 유지
    ];
    const result = mergeSpans(regex, model);
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.start)).toEqual([0, 20, 40, 60]);
    expect(result.filter((s) => s.source === 'regex')).toHaveLength(2);
    expect(result.filter((s) => s.source === 'model')).toHaveLength(2);
  });
});
