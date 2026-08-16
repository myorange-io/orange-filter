// 정규식(Tier 0) 스팬과 모델(Tier 1+) 스팬의 합집합·dedupe.
//
// 우선순위 (plan 결정):
//   1. 정규식 스팬은 항상 유지 (한국 PII 정확도가 더 높음, 체크섬 검증).
//      예외: tentative=true (동음이의어 후보) 스팬은 NER cross-validation 필수 — v1.5.8+.
//   2. 모델 스팬이 정규식 스팬과 겹치면 폐기 — 판정 기준은 카테고리 권한(SpanAuthority)별.
//   3. 모델 스팬끼리 IoU ≥ 0.5로 겹치면 confidence가 높은 것만 유지.
//   4. 동일 (start, end, category) 키는 중복 폐기.
//
// Tentative cross-validation (v1.5.8+):
//   regex가 동음이의어 후보(예: '이미지')를 NAME_BARE로 잡으면 tentative=true가 붙는다.
//   같은 위치(IoU ≥ 0.5)에 NER이 **같은 카테고리** 스팬을 confidence ≥
//   TENTATIVE_NER_CONFIRM_THRESHOLD로 제공해야 채택. NER 미설치(model=[])이거나
//   confirm 실패 시 drop. 결과 PIISpan에서 tentative 플래그는 제거(외부 미노출).

import type { PIICategory, PIISpan } from '@/shared/types';

const IOU_THRESHOLD = 0.5;

/**
 * 모델 스팬이 정규식 스팬 안에 얼마나 들어가 있으면 "조각"으로 볼 것인가.
 * (교집합 / 모델 스팬 길이) 기준 — AUTH 카테고리에서만 적용.
 */
const CONTAINMENT_THRESHOLD = 0.5;

/**
 * 잠정 스팬을 NER 결과로 확정할 최소 confidence.
 * AEGIS mBERT NER의 person_name confidence 분포 기준 — 호칭/직책 컨텍스트에서
 * 일반적으로 0.85+, 단독 등장에서 0.7~0.85. 0.7로 시작해 운영 데이터로 튜닝.
 */
const TENTATIVE_NER_CONFIRM_THRESHOLD = 0.7;

// =============================================================================
// 카테고리별 스팬 권한 (AUTH / SNAP / MODEL)
//
// LiquidAI PII-Detector의 `pii_hybrid_decode.py`가 쓰는 2티어 정책을 우리 구조에 맞춰
// 옮긴 것이다. 그쪽 원문은 "AUTH = validator로 검증되는 형식이라 정규식이 경계를 소유,
// SNAP = 오탐 위험이 큰 형식이라 모델이 먼저 발화해야 하고 정규식은 조각을 확장만".
//
// 우리 구조와의 차이 — 여기서는 **SNAP에 모델 발화를 요구하지 않는다.** 모델은 선택
// 다운로드이고 `detect()`는 모델 실패 시 정규식 단독으로 폴백한다(background/index.ts).
// 휴대폰·날짜에 모델 확인을 강제하면 모델 미설치 사용자에게 마스킹이 통째로 사라진다.
// 대신 SNAP은 보수적 판정(IoU만)으로 남기고, 모델 확인이 필요한 개별 케이스는 기존
// tentative 플래그로 opt-in 한다 — 그게 이 코드베이스의 SNAP 해당 기제다.
// =============================================================================

/**
 * - `auth`  — 고정폭·완전 앵커 패턴. 발화했다면 경계가 정확하므로, 그 **안에 들어간**
 *             모델 스팬은 언제나 같은 엔티티의 조각이다 → 폐기한다.
 *             (rrn·외국인등록·사업자번호·카드는 체크섬까지 통과한 스팬)
 * - `snap`  — 구분자·길이가 가변이라 경계를 장담할 수 없는 형식. 보수적으로
 *             IoU ≥ 0.5만 적용해 모델 근거를 함부로 삼키지 않는다.
 * - `model` — 자연어라 모델이 더 정확한 카테고리. 기존 IoU 기준 유지.
 */
export type SpanAuthority = 'auth' | 'snap' | 'model';

const CATEGORY_AUTHORITY: Record<PIICategory, SpanAuthority> = {
  // 체크섬 검증 통과
  rrn: 'auth',
  foreign_registration: 'auth',
  business_number: 'auth',
  card: 'auth',
  // 체크섬은 없지만 고정폭 + 분리자 필수라 경계가 확정적
  corporate_registration: 'auth',
  driver_license: 'auth',
  passport: 'auth',
  account: 'auth',
  email: 'auth',
  // 오탐 위험·가변 경계
  mobile: 'snap',
  landline: 'snap',
  postal_code: 'snap',
  date: 'snap',
  url: 'snap',
  credential: 'snap',
  // 모델 우위 (자연어)
  person_name: 'model',
  address: 'model',
  organization: 'model',
};

export function authorityFor(category: PIICategory): SpanAuthority {
  return CATEGORY_AUTHORITY[category];
}

function overlapLength(a: PIISpan, b: PIISpan): number {
  const interStart = Math.max(a.start, b.start);
  const interEnd = Math.min(a.end, b.end);
  return interEnd > interStart ? interEnd - interStart : 0;
}

function iou(a: PIISpan, b: PIISpan): number {
  const inter = overlapLength(a, b);
  if (inter === 0) return 0;
  const union = a.end - a.start + (b.end - b.start) - inter;
  if (union <= 0) return 0;
  return inter / union;
}

/** 모델 스팬이 정규식 스팬에 포함된 비율 (모델 스팬 길이 기준). */
function containment(model: PIISpan, regex: PIISpan): number {
  const len = model.end - model.start;
  if (len <= 0) return 0;
  return overlapLength(model, regex) / len;
}

/**
 * 정규식 스팬이 모델 스팬을 흡수하는가?
 *
 * IoU ≥ 0.5는 두 스팬 길이가 비슷할 때만 성립한다. 긴 계좌·카드 번호에서 모델이 뒷자리
 * 일부만 태그하면 IoU가 0.5 밑으로 떨어져 예전에는 둘 다 남았고, 같은 숫자열이 두 번
 * 마스킹되는 결과가 나왔다. AUTH 카테고리는 경계가 확정적이므로 포함 비율로도 판정한다.
 */
function regexAbsorbs(regexSpan: PIISpan, modelSpan: PIISpan): boolean {
  if (iou(modelSpan, regexSpan) >= IOU_THRESHOLD) return true;
  if (authorityFor(regexSpan.category) !== 'auth') return false;
  return containment(modelSpan, regexSpan) >= CONTAINMENT_THRESHOLD;
}

function spanKey(s: PIISpan): string {
  return `${s.start}:${s.end}:${s.category}`;
}

/**
 * 같은 Tier 0 안에서 생긴 중복·조각 스팬 정리.
 *
 * 정규식 detector와 인라인 cue(header-hints)는 서로를 모른 채 각각 발화하므로 같은
 * 엔티티가 두 번 잡힌다("여권번호 M12345678" → 정규식 1 + cue 1). 검토 다이얼로그에
 * 같은 항목이 두 줄로 뜨고 발견 건수도 부풀려진다.
 *
 *   1. 동일 (start, end, category)는 중복 제거.
 *   2. AUTH 스팬 안에 포함(≥ CONTAINMENT_THRESHOLD)된 스팬은 조각으로 보고 제거.
 *      예: "123-45-67890"을 사업자등록번호로 확정했는데 뒤 5자리가 우편번호로 따로
 *      잡히는 케이스. 긴 스팬을 먼저 처리해 짧은 조각만 떨어져 나간다.
 */
export function dedupeSpans(spans: ReadonlyArray<PIISpan>): PIISpan[] {
  // 긴 스팬 우선 — 조각이 아니라 본체가 먼저 채택되도록.
  const byLength = [...spans].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const kept: PIISpan[] = [];
  const seen = new Set<string>();
  for (const s of byLength) {
    const key = spanKey(s);
    if (seen.has(key)) continue;
    const isFragment = kept.some(
      (k) => authorityFor(k.category) === 'auth' && containment(s, k) >= CONTAINMENT_THRESHOLD,
    );
    if (isFragment) continue;
    kept.push(s);
    seen.add(key);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * 잠정 스팬을 NER 스팬으로 확정 가능한가?
 * 같은 카테고리 + IoU ≥ IOU_THRESHOLD + confidence ≥ 임계값.
 *
 * 카테고리를 person_name으로 하드코딩하지 않는다 — regex가 다른 카테고리에
 * tentative를 붙이면(SNAP 계열의 opt-in 확인) 그대로 동작해야 한다.
 */
function nerConfirms(tentative: PIISpan, model: ReadonlyArray<PIISpan>): boolean {
  for (const m of model) {
    if (m.category !== tentative.category) continue;
    if (m.confidence < TENTATIVE_NER_CONFIRM_THRESHOLD) continue;
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

  // 정규식·cue끼리의 중복/조각을 먼저 정리한 뒤 모델 스팬과 병합.
  const dedupedRegex = dedupeSpans(confirmedRegex);
  const out: PIISpan[] = [...dedupedRegex];
  const seen = new Set(dedupedRegex.map(spanKey));

  // 모델 스팬을 confidence 내림차순으로 정렬해 같은 위치 충돌 시 강한 것 우선
  const modelSorted = [...model].sort((a, b) => b.confidence - a.confidence);

  for (const m of modelSorted) {
    const key = spanKey(m);
    if (seen.has(key)) continue;

    // 정규식 스팬과 겹침 검사 — 권한(AUTH/SNAP/MODEL)에 따른 기준으로 폐기
    let overlap = false;
    for (const r of dedupedRegex) {
      if (regexAbsorbs(r, m)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    // 이미 채택된 모델 스팬과 IoU 검사 — 겹치면 폐기 (먼저 들어온 confidence 높은 것 유지)
    for (let i = dedupedRegex.length; i < out.length; i++) {
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
