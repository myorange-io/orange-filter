// mask-segments 비동기 검증 — v1.2 background DETECT_REQUEST 라우팅 후
// 호출 순서/진행률 콜백/헤더 처리/forcedCategory 처리가 회귀 없이 유지되는지 lock.
// chrome.runtime은 stub하지 않음 → detect-client가 정규식 폴백.

import { describe, expect, it, vi } from 'vitest';
import {
  detectSegments,
  maskSegments,
  maskSegmentsWithSpans,
  spanKey,
} from './mask-segments';
import type { Segment } from './parsers/types';

const seg = (id: string, text: string, opts: Partial<Segment> = {}): Segment => ({
  id,
  text,
  ...opts,
});

describe('maskSegments (v1.2 async)', () => {
  it('일반 segment — 정규식 detect로 mobile/email 마스킹', async () => {
    const segments: Segment[] = [
      seg('s1', '연락처 010-1234-5678 / 이메일 user@example.com'),
    ];
    const { maskedMap, totalSpans } = await maskSegments(segments);
    expect(totalSpans).toBeGreaterThanOrEqual(2);
    const masked = maskedMap.get('s1')!;
    expect(masked).not.toContain('010-1234-5678');
    expect(masked).not.toContain('user@example.com');
  });

  it('isHeader segment — 원문 그대로 (PII 컬럼은 마스킹)', async () => {
    // v1.3: 일반 본문에서 정규식 NAME 검출 안 함 (NER 책임). 표 PII 컬럼은 nameHintOnly로 활성.
    const segments: Segment[] = [
      seg('h1', '성명', { isHeader: true }),
      seg('s1', '김철수', { nameHintOnly: true }),
    ];
    const { maskedMap } = await maskSegments(segments);
    expect(maskedMap.get('h1')).toBe('성명');
    expect(maskedMap.get('s1')).not.toBe('김철수');
  });

  it('forcedCategory — 셀 전체 단일 카테고리로 마스킹', async () => {
    const segments: Segment[] = [
      seg('s1', '900101-1234567', { forcedCategory: 'rrn' }),
    ];
    const { maskedMap, totalSpans } = await maskSegments(segments);
    expect(totalSpans).toBe(1);
    expect(maskedMap.get('s1')).not.toBe('900101-1234567');
  });

  it('PII가 없는 일반 텍스트 — 원문 그대로', async () => {
    const segments: Segment[] = [seg('s1', '오늘 회의는 오후 2시입니다.')];
    const { maskedMap, totalSpans } = await maskSegments(segments);
    expect(totalSpans).toBe(0);
    expect(maskedMap.get('s1')).toBe('오늘 회의는 오후 2시입니다.');
  });

  it('onProgress — segment 마다 호출', async () => {
    const segments: Segment[] = [
      seg('s1', 'foo'),
      seg('s2', 'bar'),
      seg('s3', 'baz'),
    ];
    const onProgress = vi.fn();
    await maskSegments(segments, { onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it('빈 segments → 빈 맵', async () => {
    const { maskedMap, totalSpans } = await maskSegments([]);
    expect(maskedMap.size).toBe(0);
    expect(totalSpans).toBe(0);
  });

  it('nameHintOnly — 컨텍스트 제한 2자 이름 추가 매칭', async () => {
    // _박영.pdf — 일반 detect는 3자만 잡지만 nameHintOnly에서 2자도 잡음
    const segments: Segment[] = [
      seg('s1', '_박영.pdf', { nameHintOnly: true }),
    ];
    const { maskedMap, totalSpans } = await maskSegments(segments);
    expect(totalSpans).toBeGreaterThan(0);
    expect(maskedMap.get('s1')).not.toContain('박영');
  });
});

describe('detectSegments + maskSegmentsWithSpans (v1.4 분리)', () => {
  it('detectSegments — segment id별로 spans 반환, isHeader는 빈 배열', async () => {
    const segments: Segment[] = [
      seg('h1', '성명', { isHeader: true }),
      seg('s1', '연락처 010-1234-5678'),
      seg('s2', 'PII 없음 본문'),
    ];
    const { spansBySegment, totalSpans } = await detectSegments(segments);
    expect(spansBySegment.get('h1')).toEqual([]);
    expect((spansBySegment.get('s1') ?? []).length).toBeGreaterThan(0);
    expect(spansBySegment.get('s2')).toEqual([]);
    expect(totalSpans).toBeGreaterThan(0);
  });

  it('forcedCategory — detectSegments가 단일 PIISpan으로 변환', async () => {
    const segments: Segment[] = [
      seg('s1', '900101-1234567', { forcedCategory: 'rrn' }),
    ];
    const { spansBySegment, totalSpans } = await detectSegments(segments);
    const spans = spansBySegment.get('s1')!;
    expect(spans).toHaveLength(1);
    expect(spans[0]!.category).toBe('rrn');
    expect(spans[0]!.start).toBe(0);
    expect(spans[0]!.end).toBe('900101-1234567'.length);
    expect(totalSpans).toBe(1);
  });

  it('maskSegmentsWithSpans — enabledSpanKeys로 일부만 마스킹', async () => {
    const segments: Segment[] = [
      seg('s1', '연락처 010-1234-5678 / 이메일 user@example.com'),
    ];
    const { spansBySegment } = await detectSegments(segments);
    const allSpans = spansBySegment.get('s1')!;
    // 첫 span만 활성, 나머지는 OFF
    const enabled = new Set([spanKey(allSpans[0]!)]);
    const { maskedMap, totalSpans } = maskSegmentsWithSpans(
      segments,
      spansBySegment,
      enabled,
    );
    expect(totalSpans).toBe(1);
    const masked = maskedMap.get('s1')!;
    // 첫 PII는 가려지고, 나머지는 원문 유지 — 둘 중 하나는 원문에 남아 있어야 함.
    const stillContains =
      masked.includes('010-1234-5678') || masked.includes('user@example.com');
    expect(stillContains).toBe(true);
  });

  it('maskSegmentsWithSpans — enabledSpanKeys 미지정 시 전체 마스킹', async () => {
    const segments: Segment[] = [
      seg('s1', '연락처 010-1234-5678 / 이메일 user@example.com'),
    ];
    const { spansBySegment } = await detectSegments(segments);
    const { maskedMap } = maskSegmentsWithSpans(segments, spansBySegment);
    const masked = maskedMap.get('s1')!;
    expect(masked).not.toContain('010-1234-5678');
    expect(masked).not.toContain('user@example.com');
  });

  it('maskSegmentsWithSpans — 빈 enabledSpanKeys면 모두 원문 유지', async () => {
    const segments: Segment[] = [
      seg('s1', '연락처 010-1234-5678'),
    ];
    const { spansBySegment } = await detectSegments(segments);
    const { maskedMap, totalSpans } = maskSegmentsWithSpans(
      segments,
      spansBySegment,
      new Set(),
    );
    expect(totalSpans).toBe(0);
    expect(maskedMap.get('s1')).toBe('연락처 010-1234-5678');
  });
});
