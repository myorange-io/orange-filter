// Segment 배열을 받아 detect + 헤더 힌트(forcedCategory/isHeader) +
// 인라인 라벨 패턴까지 합쳐 마스킹 결과를 셀 id별로 반환.
// 파이프라인 핵심이라 사이드패널/테스트에서 공용.

import type { Segment } from './parsers/types';
import { maskText } from '@/background/pii/mask';
import { detectKoreanPII } from '@/background/pii/regex';
import { findInlineLabels } from '@/background/pii/header-hints';
import type { PIISpan } from '@/shared/types';

export interface MaskSegmentsResult {
  maskedMap: Map<string, string>;
  totalSpans: number;
}

export function maskSegments(segments: ReadonlyArray<Segment>): MaskSegmentsResult {
  const out = new Map<string, string>();
  let total = 0;
  for (const seg of segments) {
    // 헤더 행은 PII가 아님 — 원문 유지.
    if (seg.isHeader) {
      out.set(seg.id, seg.text);
      continue;
    }

    // 표 헤더가 가리키는 컬럼: 셀 전체를 강제 카테고리로 마스킹.
    if (seg.forcedCategory) {
      const forcedSpan: PIISpan = {
        start: 0,
        end: seg.text.length,
        text: seg.text,
        category: seg.forcedCategory,
        confidence: 1,
        source: 'regex',
      };
      const result = maskText(seg.text, [forcedSpan]);
      out.set(seg.id, result.text);
      total += result.applied.length;
      continue;
    }

    // 일반 segment — detect + 인라인 라벨("성명: 조성도") 패턴 합쳐서 마스킹.
    const detected = detectKoreanPII(seg.text);
    const inline = findInlineLabels(seg.text).map<PIISpan>((m) => ({
      start: m.valueStart,
      end: m.valueEnd,
      text: seg.text.slice(m.valueStart, m.valueEnd),
      category: m.category,
      confidence: 1,
      source: 'regex',
    }));
    const all = [...detected, ...inline];
    if (all.length === 0) {
      out.set(seg.id, seg.text);
      continue;
    }
    const result = maskText(seg.text, all);
    out.set(seg.id, result.text);
    total += result.applied.length;
  }
  return { maskedMap: out, totalSpans: total };
}
