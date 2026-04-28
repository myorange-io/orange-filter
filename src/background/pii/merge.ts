// 정규식(Tier 0) 스팬과 모델(Tier 1+) 스팬의 합집합·dedupe.
//
// 우선순위 (plan 결정):
//   1. 정규식 스팬은 항상 유지 (한국 PII 정확도가 더 높음, 체크섬 검증).
//   2. 모델 스팬이 정규식 스팬과 IoU ≥ 0.5로 겹치면 모델 스팬 폐기.
//   3. 모델 스팬끼리 IoU ≥ 0.5로 겹치면 confidence가 높은 것만 유지.
//   4. 동일 (start, end, category) 키는 중복 폐기.

import type { PIISpan } from '@/shared/types';

const IOU_THRESHOLD = 0.5;

function iou(a: PIISpan, b: PIISpan): number {
  const interStart = Math.max(a.start, b.start);
  const interEnd = Math.min(a.end, b.end);
  if (interEnd <= interStart) return 0;
  const inter = interEnd - interStart;
  const union = a.end - a.start + (b.end - b.start) - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function spanKey(s: PIISpan): string {
  return `${s.start}:${s.end}:${s.category}`;
}

export function mergeSpans(regex: ReadonlyArray<PIISpan>, model: ReadonlyArray<PIISpan>): PIISpan[] {
  const out: PIISpan[] = [...regex];
  const seen = new Set(regex.map(spanKey));

  // 모델 스팬을 confidence 내림차순으로 정렬해 같은 위치 충돌 시 강한 것 우선
  const modelSorted = [...model].sort((a, b) => b.confidence - a.confidence);

  for (const m of modelSorted) {
    const key = spanKey(m);
    if (seen.has(key)) continue;

    // 정규식 스팬과 IoU 검사 — 겹치면 폐기
    let overlap = false;
    for (const r of regex) {
      if (iou(m, r) >= IOU_THRESHOLD) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    // 이미 채택된 모델 스팬과 IoU 검사 — 겹치면 폐기 (먼저 들어온 confidence 높은 것 유지)
    for (let i = regex.length; i < out.length; i++) {
      if (iou(m, out[i]!) >= IOU_THRESHOLD) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    out.push(m);
    seen.add(key);
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}
