// Segment 배열을 받아 detect + 헤더 힌트(forcedCategory/isHeader) +
// 인라인 라벨 패턴까지 합쳐 마스킹 결과를 셀 id별로 반환.
// 파이프라인 핵심이라 사이드패널/테스트에서 공용.
//
// v1.2: 일반 segment 검출은 background DETECT_REQUEST로 라우팅하여 정규식 + NER 합산.
// chrome.runtime이 없는 환경(테스트, 노드)에서는 정규식 폴백 (detect-client에 내장).
//
// v1.4: detect와 mask를 두 함수로 분리. 검토 모달이 detect 결과를 사용자에게 보여주고,
// confirm 시점에만 mask를 실행. enabledSpanKeys로 span 단위 토글 반영.

import type { Segment } from './parsers/types';
import { maskText, spanKey } from '@/background/pii/mask';
import { detectContextualName } from '@/background/pii/regex';
import { findInlineLabels } from '@/background/pii/header-hints';
import { requestDetect } from '@/shared/lib/detect-client';
import type { PIISpan } from '@/shared/types';

export interface MaskSegmentsResult {
  maskedMap: Map<string, string>;
  totalSpans: number;
}

export interface MaskSegmentsOptions {
  /** 진행률 콜백. 큐 처리 UI 갱신용. */
  onProgress?: (done: number, total: number) => void;
}

export interface DetectSegmentsResult {
  /** segment id → 해당 segment의 spans 배열. forcedCategory도 PIISpan으로 변환됨. */
  spansBySegment: Map<string, PIISpan[]>;
  /** 모든 segment의 spans 합계 (UI 발견 건수 표시용) */
  totalSpans: number;
}

/**
 * Segment 배열을 detect만 수행. mask는 적용하지 않음.
 * 검토 단계가 필요한 흐름(파일 큐 v1.4+)이 호출.
 *
 * - isHeader segment: spans 빈 배열 (마스킹 대상 아님).
 * - forcedCategory segment: 셀 전체를 해당 카테고리 단일 PIISpan으로 등록.
 * - 일반 segment: background detect + 인라인 라벨 + nameHintOnly 보강.
 */
export async function detectSegments(
  segments: ReadonlyArray<Segment>,
  options: MaskSegmentsOptions = {},
): Promise<DetectSegmentsResult> {
  const spansBySegment = new Map<string, PIISpan[]>();
  let totalSpans = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.isHeader) {
      spansBySegment.set(seg.id, []);
      options.onProgress?.(i + 1, segments.length);
      continue;
    }
    if (seg.forcedCategory) {
      const forcedSpan: PIISpan = {
        start: 0,
        end: seg.text.length,
        text: seg.text,
        category: seg.forcedCategory,
        confidence: 1,
        source: 'regex',
      };
      spansBySegment.set(seg.id, [forcedSpan]);
      totalSpans += 1;
      options.onProgress?.(i + 1, segments.length);
      continue;
    }
    const detected = (await requestDetect(seg.text)).spans;
    const inline = findInlineLabels(seg.text).map<PIISpan>((m) => ({
      start: m.valueStart,
      end: m.valueEnd,
      text: seg.text.slice(m.valueStart, m.valueEnd),
      category: m.category,
      confidence: 1,
      source: 'regex',
    }));
    const contextual = seg.nameHintOnly ? detectContextualName(seg.text) : [];
    const all = [...detected, ...inline, ...contextual];
    spansBySegment.set(seg.id, all);
    totalSpans += all.length;
    options.onProgress?.(i + 1, segments.length);
  }
  return { spansBySegment, totalSpans };
}

/**
 * detectSegments 결과 + 사용자 토글(enabledSpanKeys)로 maskedMap 생성.
 * 모델 호출 없는 순수 함수 — 토글 변경마다 호출해도 안전.
 *
 * enabledSpanKeys === undefined: 모든 span 적용 (기존 동작).
 */
export function maskSegmentsWithSpans(
  segments: ReadonlyArray<Segment>,
  spansBySegment: ReadonlyMap<string, ReadonlyArray<PIISpan>>,
  enabledSpanKeys?: ReadonlySet<string>,
): MaskSegmentsResult {
  const out = new Map<string, string>();
  let total = 0;
  for (const seg of segments) {
    const spans = spansBySegment.get(seg.id) ?? [];
    if (seg.isHeader || spans.length === 0) {
      out.set(seg.id, seg.text);
      continue;
    }
    const result = maskText(seg.text, spans, { enabledSpanKeys });
    out.set(seg.id, result.text);
    total += result.applied.length;
  }
  return { maskedMap: out, totalSpans: total };
}

/**
 * 기존 호출자 호환 — detect + mask를 한 번에. enabledSpanKeys 없이 모든 span 적용.
 * 신규 흐름은 detectSegments + (검토) + maskSegmentsWithSpans를 분리해 사용.
 */
export async function maskSegments(
  segments: ReadonlyArray<Segment>,
  options: MaskSegmentsOptions = {},
): Promise<MaskSegmentsResult> {
  const { spansBySegment } = await detectSegments(segments, options);
  return maskSegmentsWithSpans(segments, spansBySegment);
}

// 재export — 호출자가 spanKey 헬퍼를 별도 import할 필요 없게.
export { spanKey };
