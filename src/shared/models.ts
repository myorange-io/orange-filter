// 모델 레지스트리 — 단일 default 모델 (한국어 정밀 NER).
//
// v1.0 정책: 한국어 paste 정확도가 1차 가치. AEGIS PII (mBERT 한국어 fine-tune,
// INT8 양자화 ~50MB)을 default Tier 1로 채택. 사용자가 사이드패널 모델 탭에서
// 명시적으로 다운로드해야 활성화 — 자동 워밍업 없음.
//
// Tier 2 옵션은 v1.1+에서 (다국어/타 도메인 모델). 현재는 default 1종만.

import type { ModelTier } from '@/background/pii/router';

export interface ModelDefinition {
  /** 라우터가 사용하는 tier 키 */
  tier: ModelTier;
  /** Transformers.js / HF 호환 모델 ID. CDN 호스팅 시 절대 URL 가능 */
  modelId: string;
  /** 사이드패널 UI 표시명 */
  labelKo: string;
  /** 한 줄 설명 */
  descriptionKo: string;
  /** 예상 다운로드 크기 (int8 양자화 후, 사용자 안내용) */
  approxDownloadMB: number;
  /** 라이선스 정보 표시용 */
  license: string;
  /** 출시 가능 여부. false면 UI에서 "준비중"으로 disable. */
  shippable: boolean;
}

/**
 * Tier 1 default — 한국어 정밀 NER (AEGIS PII).
 * mBERT-base 178M params. q8 양자화 ONNX + tokenizer/vocab/config 합산 ~170MB.
 * 학습: 한국 PII 합성 64k + BoB14 20k + Hard Negative 19k + ai4privacy 47k.
 * 한국어 F1 0.9632, 영문 F1 0.9119, FPR 0.33%. 라벨 18종(IDCARD/
 * DRIVERLICENSENUM/CREDITCARDNUMBER/ACCOUNTNUM 등)이 우리 PIICategory와 직접 매핑
 * (mapLabel 참조).
 */
export const TIER1_DEFAULT: ModelDefinition = {
  tier: 'tier1-default',
  modelId: 'YATAV-ENT/aegis-personal-pii-ner',
  labelKo: '한국어 정밀 보호 모델',
  descriptionKo:
    '한국어·영어 개인정보를 학습한 AI 인식 모델. 주민등록번호·운전면허번호·계좌·카드 같은 항목을 정확하게 잡아내요.',
  approxDownloadMB: 170,
  license: 'Apache-2.0',
  shippable: true,
};

/**
 * Tier 2 — v1.1+ 확장 자리. 현재는 비어 있음.
 */
export const TIER2_OPTIONS: ReadonlyArray<ModelDefinition> = [];

export const ALL_MODELS: ReadonlyArray<ModelDefinition> = [TIER1_DEFAULT, ...TIER2_OPTIONS];

export function getModelByTier(tier: ModelTier): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.tier === tier);
}

export function getModelById(modelId: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.modelId === modelId);
}
