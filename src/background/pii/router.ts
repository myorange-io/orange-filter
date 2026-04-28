// 모델 라우터 — userMode + 텍스트 통계로 활성 Tier 1 모델 선택.
//
// v1: Tier 1 모델 1개(default)만 활성. Tier 2(multilingual / precision_high)는
// 사용자가 다운로드한 경우에만 사용 가능. 라우팅 결정은 offscreen으로 전달되어
// 모델 swap을 트리거.

export type ModelTier = 'tier1-default' | 'tier2-multilingual' | 'tier2-precision';

export type UserMode = 'default' | 'multilingual' | 'precision_high';

export interface RouterDeps {
  /** Tier 모델이 다운로드 완료 상태인지 (IndexedDB 또는 메타데이터로 판단). */
  hasModel(tier: ModelTier): boolean;
}

/**
 * 한글 비율 — Hangul Syllables(가-힣) + Jamo(ㄱ-ㅎ, ㅏ-ㅣ).
 */
export function countKoreanRatio(text: string): number {
  if (text.length === 0) return 0;
  const matches = text.match(/[가-힯ᄀ-ᇿ㄰-㆏]/g);
  return (matches?.length ?? 0) / text.length;
}

/**
 * 라우팅 결정. v1에서는 Tier 1 default가 거의 항상 선택됨.
 * - precision_high + 정밀 모델 보유 → tier2-precision
 * - multilingual + 다국어 모델 보유 + 한글 비율 < 0.4 → tier2-multilingual
 * - 그 외 → tier1-default
 */
export function pickModel(text: string, mode: UserMode, deps: RouterDeps): ModelTier {
  if (mode === 'precision_high' && deps.hasModel('tier2-precision')) {
    return 'tier2-precision';
  }
  const koreanRatio = countKoreanRatio(text);
  if (mode === 'multilingual' && deps.hasModel('tier2-multilingual') && koreanRatio < 0.4) {
    return 'tier2-multilingual';
  }
  return 'tier1-default';
}
