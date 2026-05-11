import { describe, expect, it } from 'vitest';
import { filterNerFalsePositives } from './ner-filter';
import type { PIISpan } from '@/shared/types';

const span = (
  text: string,
  category: PIISpan['category'] = 'person_name',
  confidence = 0.6,
): PIISpan => ({
  start: 0,
  end: text.length,
  text,
  category,
  confidence,
  source: 'model',
});

describe('filterNerFalsePositives', () => {
  it('영문 stopword (do/is/me/the)는 person_name이면 제거', () => {
    const out = filterNerFalsePositives([
      span('do'),
      span('is'),
      span('me'),
      span('the'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('대소문자 무관 — Do/IS도 제거', () => {
    const out = filterNerFalsePositives([span('Do'), span('IS')]);
    expect(out).toHaveLength(0);
  });

  it('짧은 ASCII (≤3자) + 낮은 confidence는 제거', () => {
    const out = filterNerFalsePositives([
      span('Xy', 'person_name', 0.7),
      span('Bob', 'person_name', 0.7),
    ]);
    expect(out).toHaveLength(0);
  });

  it('짧은 ASCII이지만 confidence ≥ 0.85는 통과', () => {
    const out = filterNerFalsePositives([
      span('Xyz', 'person_name', 0.9),
    ]);
    expect(out).toHaveLength(1);
  });

  it('한글 이름은 항상 통과 (length 무관)', () => {
    const out = filterNerFalsePositives([
      span('조성도', 'person_name', 0.5),
      span('이', 'person_name', 0.5),
    ]);
    expect(out).toHaveLength(2);
  });

  it('person_name 외 카테고리는 통과', () => {
    const out = filterNerFalsePositives([
      span('do', 'address', 0.5),
      span('is', 'organization', 0.5),
    ]);
    expect(out).toHaveLength(2);
  });

  it('긴 영문 이름(4자 이상)은 confidence 무관 통과', () => {
    const out = filterNerFalsePositives([
      span('Sungdo', 'person_name', 0.5),
      span('Cho Sungdo', 'person_name', 0.5),
    ]);
    expect(out).toHaveLength(2);
  });

  it('영문 인사 시간대(am/pm/utc)도 차단', () => {
    const out = filterNerFalsePositives([
      span('am', 'person_name', 0.5),
      span('pm', 'person_name', 0.5),
      span('utc', 'person_name', 0.5),
    ]);
    expect(out).toHaveLength(0);
  });
});
