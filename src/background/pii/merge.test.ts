import { describe, expect, test } from 'vitest';
import { dedupeSpans, mergeSpans } from './merge';
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

  describe('v1.5.8 tentative (동음이의어) cross-validation', () => {
    function tentative(start: number, end: number, text: string): PIISpan {
      return {
        start,
        end,
        text,
        category: 'person_name',
        confidence: 0.6,
        source: 'regex',
        tentative: true,
      };
    }

    test('NER이 confirm 안 하면 잠정 스팬 drop (사용자 호소: 마케팅 프로모션 이미지의)', () => {
      // "스타벅스 코리아의 마케팅 프로모션 이미지의" 상황 시뮬레이션:
      // regex가 "이미지"를 NAME_BARE로 잡지만 tentative=true.
      // NER은 같은 위치에 person_name 스팬을 제공하지 않음 → drop.
      const regex = [tentative(20, 23, '이미지')];
      const model: PIISpan[] = []; // NER이 person_name으로 안 잡음
      expect(mergeSpans(regex, model)).toEqual([]);
    });

    test('NER이 같은 위치에 충분한 confidence로 confirm 하면 채택, tentative 플래그 제거', () => {
      const regex = [tentative(10, 13, '이미지')];
      const model = [span(10, 13, 'person_name', 'model', 0.85, '이미지')];
      const result = mergeSpans(regex, model);
      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe('regex');
      expect(result[0]!.tentative).toBeUndefined(); // 플래그 제거
      expect(result[0]!.text).toBe('이미지');
    });

    test('NER confidence < 0.7이면 confirm 실패로 잠정 regex는 drop (NER 스팬 자체는 별개 채택)', () => {
      // 잠정 regex는 NER confidence 0.5에 confirm 실패 → drop.
      // NER 스팬 자체는 mergeSpans의 기존 흐름으로 채택될 수 있음(낮은 confidence NER 필터링은
      // ner-filter.ts 책임). 본 테스트는 "regex source 스팬이 결과에서 사라짐"만 검증.
      const regex = [tentative(10, 13, '이미지')];
      const model = [span(10, 13, 'person_name', 'model', 0.5, '이미지')];
      const result = mergeSpans(regex, model);
      expect(result.filter((s) => s.source === 'regex')).toEqual([]);
    });

    test('일반(non-tentative) regex 스팬은 NER 영향 없이 유지', () => {
      const regex = [span(0, 3, 'person_name', 'regex', 0.6, '김민수')];
      const model: PIISpan[] = []; // NER 없음
      expect(mergeSpans(regex, model)).toEqual(regex);
    });

    test('잠정과 일반 regex 스팬 혼재 — 잠정만 cross-validate, 일반은 그대로', () => {
      const regex = [
        span(0, 3, 'person_name', 'regex', 0.6, '김민수'), // 일반 — 유지
        tentative(10, 13, '이미지'), // 잠정 — NER 없으면 drop
      ];
      const result = mergeSpans(regex, []);
      expect(result).toHaveLength(1);
      expect(result[0]!.text).toBe('김민수');
    });

    test('NER 미설치 사용자 흐름 — model=[]에서 tentative 모두 drop (옵션 A 동작)', () => {
      const regex = [
        tentative(0, 3, '이미지'),
        tentative(10, 13, '이미지'),
        span(20, 23, 'person_name', 'regex', 0.6, '김민수'), // 일반은 유지
      ];
      const result = mergeSpans(regex, []);
      expect(result).toHaveLength(1);
      expect(result[0]!.text).toBe('김민수');
    });

    test('confirm은 같은 카테고리끼리만 — person_name NER이 account 잠정을 확정하지 못함', () => {
      const regex: PIISpan[] = [
        {
          start: 10,
          end: 25,
          text: '1002-100-100100',
          category: 'account',
          confidence: 0.6,
          source: 'regex',
          tentative: true,
        },
      ];
      const model = [span(10, 25, 'person_name', 'model', 0.95)];
      expect(mergeSpans(regex, model).filter((s) => s.source === 'regex')).toEqual([]);
    });
  });

  describe('카테고리 권한 (AUTH / SNAP)', () => {
    test('AUTH: 정규식 스팬 안에 든 모델 조각은 IoU < 0.5여도 폐기', () => {
      // "1002-100-100100"(15자)을 정규식이 계좌로 확정했는데 모델이 뒷자리 "100100"만
      // 태그한 상황. IoU = 6/15 = 0.4로 예전에는 둘 다 남아 같은 숫자열이 두 번 마스킹됐다.
      const regex = [span(0, 15, 'account', 'regex', 0.99)];
      const model = [span(9, 15, 'account', 'model', 0.9)];
      expect(mergeSpans(regex, model)).toEqual(regex);
    });

    test('AUTH: 카테고리가 달라도 정규식 스팬 안의 조각이면 폐기', () => {
      // 체크섬 통과한 주민번호 안에서 모델이 앞 6자리를 생년월일로 태그하는 케이스.
      const regex = [span(0, 14, 'rrn', 'regex', 0.99)];
      const model = [span(0, 6, 'date', 'model', 0.9)];
      expect(mergeSpans(regex, model)).toEqual(regex);
    });

    test('AUTH: 살짝 걸치기만 한 모델 스팬은 유지 (포함 비율 < 0.5)', () => {
      // 정규식 email [0,20] vs 모델 [18,40] → 포함 2/22 ≈ 0.09, IoU 0.05 → 별개 엔티티.
      const regex = [span(0, 20, 'email', 'regex', 0.99)];
      const model = [span(18, 40, 'address', 'model', 0.9)];
      expect(mergeSpans(regex, model)).toHaveLength(2);
    });

    test('SNAP: 경계를 장담 못 하므로 포함돼 있어도 IoU 기준만 적용', () => {
      // 정규식 mobile [0,13] vs 모델 [9,13] → 포함 1.0이지만 IoU 4/13 ≈ 0.31.
      // AUTH였다면 폐기되지만 SNAP은 모델 근거를 삼키지 않는다.
      const regex = [span(0, 13, 'mobile', 'regex', 0.95)];
      const model = [span(9, 13, 'mobile', 'model', 0.9)];
      expect(mergeSpans(regex, model)).toHaveLength(2);
    });

    test('MODEL 권한 카테고리(person_name)도 IoU 기준 유지', () => {
      const regex = [span(0, 10, 'person_name', 'regex', 0.9)];
      const model = [span(7, 10, 'person_name', 'model', 0.9)]; // IoU 3/10 = 0.3
      expect(mergeSpans(regex, model)).toHaveLength(2);
    });
  });
});

describe('dedupeSpans', () => {
  test('동일 (start,end,category) 중복 제거 — 정규식 + 인라인 cue 이중 발화', () => {
    // "여권번호 M12345678" — 정규식 PASSPORT 패턴과 cue가 같은 스팬을 각각 만든다.
    const spans = [
      span(5, 14, 'passport', 'regex', 0.95, 'M12345678'),
      span(5, 14, 'passport', 'regex', 1, 'M12345678'),
    ];
    expect(dedupeSpans(spans)).toHaveLength(1);
  });

  test('AUTH 스팬 안의 조각 제거 — 사업자번호 뒤 5자리가 우편번호로 잡히는 케이스', () => {
    const biz = span(0, 12, 'business_number', 'regex', 1, '123-45-67890');
    const zip = span(7, 12, 'postal_code', 'regex', 0.9, '67890');
    const result = dedupeSpans([zip, biz]);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('business_number');
  });

  test('SNAP 스팬 안의 조각은 남긴다 (경계를 장담할 수 없음)', () => {
    const phone = span(0, 13, 'mobile', 'regex', 0.95);
    const inner = span(9, 13, 'postal_code', 'regex', 0.9);
    expect(dedupeSpans([phone, inner])).toHaveLength(2);
  });

  test('겹치지 않는 스팬은 모두 유지하고 start 정렬', () => {
    const spans = [
      span(50, 60, 'email', 'regex'),
      span(0, 13, 'rrn', 'regex'),
      span(20, 33, 'mobile', 'regex'),
    ];
    expect(dedupeSpans(spans).map((s) => s.start)).toEqual([0, 20, 50]);
  });

  test('빈 입력', () => {
    expect(dedupeSpans([])).toEqual([]);
  });
});
