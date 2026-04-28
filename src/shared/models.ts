// 모델 레지스트리 — Tier 1 default + Tier 2 옵션 (multilingual / precision_high).
// Tier 2 모델은 첫 사용 시 다운로드 필요. ModelManager UI에서 사용자가 명시 동의.
//
// 모델 swap 정책:
//   - Tier 1 (default): 항상 활성. 첫 paste 전 워밍업 완료. ~30MB
//   - Tier 2 (multilingual): 한국어 비율 < 0.4인 paste에서 사용. 사용자 ON.
//   - Tier 2 (precision_high): 모드가 'precision_high'일 때 사용. 사용자 ON.
//
// 라우팅: pickModel()이 userMode + 한글 비율 + 다운로드 가용성으로 결정.

import type { ModelTier } from '@/background/pii/router';

export interface ModelDefinition {
  /** 라우터가 사용하는 tier 키 */
  tier: ModelTier;
  /** Transformers.js / HF 호환 모델 ID. CDN 호스팅 시 절대 URL 가능 (예: 'https://cdn.example.com/koelectra-onnx') */
  modelId: string;
  /** 사이드패널 UI 표시명 */
  labelKo: string;
  /** 한 줄 설명 — 어떤 paste에서 도움이 되는지 */
  descriptionKo: string;
  /** 예상 다운로드 크기 (int8 양자화 후, 사용자 안내용) */
  approxDownloadMB: number;
  /** 라이선스 정보 표시용 */
  license: string;
  /**
   * 출시 가능 여부. false면 UI에서 "준비중"으로 disable.
   * KoELECTRA처럼 사용자/팀이 ONNX 변환 + 호스팅 작업이 끝나야 true로 전환.
   */
  shippable: boolean;
}

/**
 * Tier 1 default — 항상 다운로드되는 기본 모델.
 * 영문 NER이지만 한국어 정규식 + 성씨 사전이 1차 처리. v1.0 기준.
 */
export const TIER1_DEFAULT: ModelDefinition = {
  tier: 'tier1-default',
  modelId: 'Xenova/bert-base-NER',
  labelKo: '기본 NER (영문)',
  descriptionKo: '영문 paste의 인명/조직/지명을 정밀하게 잡습니다. 한국어는 정규식이 1차로 처리합니다.',
  approxDownloadMB: 30,
  license: 'MIT',
  shippable: true,
};

/**
 * Tier 2 — 사용자가 명시적으로 다운로드해야 활성화.
 * `shippable: false`인 항목은 UI에서 "준비중"으로 표시되어 사용자가 클릭해도 동작 X.
 */
export const TIER2_OPTIONS: ReadonlyArray<ModelDefinition> = [
  {
    tier: 'tier2-multilingual',
    // Xenova가 ONNX로 변환한 다국어 NER. 한국어는 약하지만 영어/일본어/중국어는 잘.
    modelId: 'Xenova/xlm-roberta-base',
    labelKo: '다국어 NER (XLM-RoBERTa)',
    descriptionKo: '영어/일본어/중국어 등 한국어 외 언어가 섞인 paste에 권장합니다.',
    approxDownloadMB: 280,
    license: 'MIT',
    shippable: false, // 282MB는 무거워 v1.1 검토. 일단 옵션으로만 노출.
  },
  {
    tier: 'tier2-precision',
    // AEGIS Personal PII NER (mBERT 기반, INT8 양자화 ONNX 완료, Transformers.js 호환).
    // 한국어 F1 0.9632, 영문 F1 0.9119, FPR 0.33%. 학습: 한국 PII 합성 64k +
    // BoB14TeamSentinel 20k + Hard Negative 19k + ai4privacy 47k = 170k.
    // 라벨 18종 중 IDCARD/DRIVERLICENSENUM/ACCOUNTNUM/CREDITCARDNUMBER 등이 우리
    // 카테고리와 직접 매핑 (mapLabel 참조).
    modelId: 'YATAV-ENT/aegis-personal-pii-ner',
    labelKo: '한국어 정밀 NER (AEGIS PII)',
    descriptionKo:
      '한국어·영어 PII를 직접 학습한 mBERT 기반 모델. 주민번호·운전면허·계좌·카드 등 한국 PII 라벨을 직접 인식합니다. NPO 양식 등 한국어 컨텐츠에 권장.',
    approxDownloadMB: 50,
    license: 'Apache-2.0',
    shippable: true, // ONNX INT8 양자화본 (./onnx/model_quantized.onnx) 즉시 사용
  },
];

export const ALL_MODELS: ReadonlyArray<ModelDefinition> = [TIER1_DEFAULT, ...TIER2_OPTIONS];

export function getModelByTier(tier: ModelTier): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.tier === tier);
}

export function getModelById(modelId: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.modelId === modelId);
}
