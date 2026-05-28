// 정규식(Tier 0) 스팬과 모델(Tier 1+) 스팬의 합집합·dedupe.
//
// 우선순위 (plan 결정):
//   1. 정규식 스팬은 항상 유지 (한국 PII 정확도가 더 높음, 체크섬 검증).
//      예외: tentative=true (동음이의어 후보) 스팬은 NER cross-validation 필수 — v1.5.8+.
//   2. 모델 스팬이 정규식 스팬과 IoU ≥ 0.5로 겹치면 모델 스팬 폐기.
//   3. 모델 스팬끼리 IoU ≥ 0.5로 겹치면 confidence가 높은 것만 유지.
//   4. 동일 (start, end, category) 키는 중복 폐기.
//
// Tentative cross-validation (v1.5.8+):
//   regex가 동음이의어 후보(예: '이미지')를 NAME_BARE로 잡으면 tentative=true가 붙는다.
//   같은 위치(IoU ≥ 0.5)에 NER이 person_name 스팬을 confidence ≥ HOMONYM_NER_CONFIRM_THRESHOLD로
//   제공해야 채택. NER 미설치(model=[])이거나 confirm 실패 시 drop.
//   결과 PIISpan에서 tentative 플래그는 제거(외부에 노출하지 않음).

import type { PIISpan } from '@/shared/types';

const IOU_THRESHOLD = 0.5;

/**
 * 동음이의어 후보 스팬을 NER 결과로 확정할 최소 confidence.
 * AEGIS mBERT NER의 person_name confidence 분포 기준 — 호칭/직책 컨텍스트에서
 * 일반적으로 0.85+, 단독 등장에서 0.7~0.85. 0.7로 시작해 운영 데이터로 튜닝.
 */
const HOMONYM_NER_CONFIRM_THRESHOLD = 0.7;

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

/**
 * 잠정 스팬을 NER 스팬으로 확정 가능한가?
 * 같은 person_name 카테고리 + IoU ≥ IOU_THRESHOLD + confidence ≥ 임계값.
 */
function nerConfirms(tentative: PIISpan, model: ReadonlyArray<PIISpan>): boolean {
  for (const m of model) {
    if (m.category !== 'person_name') continue;
    if (m.confidence < HOMONYM_NER_CONFIRM_THRESHOLD) continue;
    if (iou(tentative, m) >= IOU_THRESHOLD) return true;
  }
  return false;
}

/** PIISpan에서 tentative 플래그 제거(외부 노출용). */
function strip(s: PIISpan): PIISpan {
  if (s.tentative === undefined) return s;
  const { tentative: _t, ...rest } = s;
  return rest;
}

export function mergeSpans(regex: ReadonlyArray<PIISpan>, model: ReadonlyArray<PIISpan>): PIISpan[] {
  // 1단계: 잠정 스팬 cross-validation. NER이 confirm 안 하면 drop.
  // 일반(non-tentative) regex 스팬은 그대로 유지.
  const confirmedRegex: PIISpan[] = [];
  for (const r of regex) {
    if (r.tentative) {
      if (nerConfirms(r, model)) {
        confirmedRegex.push(strip(r));
      }
      // confirm 실패 — drop. 일반명사로 처리됨.
      continue;
    }
    confirmedRegex.push(r);
  }

  const out: PIISpan[] = [...confirmedRegex];
  const seen = new Set(confirmedRegex.map(spanKey));

  // 모델 스팬을 confidence 내림차순으로 정렬해 같은 위치 충돌 시 강한 것 우선
  const modelSorted = [...model].sort((a, b) => b.confidence - a.confidence);

  for (const m of modelSorted) {
    const key = spanKey(m);
    if (seen.has(key)) continue;

    // 정규식 스팬과 IoU 검사 — 겹치면 폐기
    let overlap = false;
    for (const r of confirmedRegex) {
      if (iou(m, r) >= IOU_THRESHOLD) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    // 이미 채택된 모델 스팬과 IoU 검사 — 겹치면 폐기 (먼저 들어온 confidence 높은 것 유지)
    for (let i = confirmedRegex.length; i < out.length; i++) {
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
