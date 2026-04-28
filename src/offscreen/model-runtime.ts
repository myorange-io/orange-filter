// Tier 1 모델 런타임 — Offscreen Document에서 동작.
//
// MV3 Service Worker는 ~30s 후 evict되고 WebGPU 지원이 불안정 → 모델 인스턴스는
// offscreen에 유지한다. Transformers.js는 자체적으로 IndexedDB(`huggingface/transformers/...`
// 키)에 모델 weights를 캐시하므로 첫 다운로드 후 오프라인 동작.
//
// 모델 선택 (S8 시점):
//   - 플랜 1순위 `Leo97/KoELECTRA-small-v3-modu-ner`은 HF에 ONNX 미배포.
//     → optimum-cli로 변환 후 사용자/팀 CDN에 호스팅 필요 (별도 작업).
//   - v1 동작 검증용 기본값: `Xenova/bert-base-NER` — 영문 NER, ONNX 제공, int8 ~30MB.
//   - Korean 인명/조직/지명은 Tier 0 정규식 + 한국 성씨 사전 휴리스틱이 1차로 처리.
//   - KoELECTRA 변환 완료 시 MODEL_ID 한 줄만 교체.

import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { PIICategory, PIISpan } from '@/shared/types';

// 확장 환경에서는 외부 onnxruntime-web의 wasm 경로가 chrome-extension://가 아니라
// CDN을 향하도록 두는 것이 가장 안정적 (CSP 충돌 회피).
// 추후 self-host로 전환할 때 env.backends.onnx.wasm.wasmPaths를 'chrome.runtime.getURL(...)'로 교체.
env.allowLocalModels = false;
env.useBrowserCache = true; // IndexedDB 캐시 ON

const DEFAULT_MODEL_ID = 'Xenova/bert-base-NER';

let pipelinePromise: Promise<TokenClassificationPipeline> | null = null;
let activeModelId: string | null = null;

interface LoadOptions {
  modelId?: string;
  onProgress?: (progress: { pct: number; bytesLoaded: number; bytesTotal: number }) => void;
}

export async function loadModel(options: LoadOptions = {}): Promise<TokenClassificationPipeline> {
  const id = options.modelId ?? DEFAULT_MODEL_ID;
  if (pipelinePromise && activeModelId === id) return pipelinePromise;

  activeModelId = id;
  pipelinePromise = (async () => {
    const pipe = await pipeline('token-classification', id, {
      // int8 양자화로 첫 다운로드 ~30MB 수준
      dtype: 'q8',
      progress_callback: (p) => {
        if (!options.onProgress) return;
        // Transformers.js의 progress 객체는 { status, file, progress (0..100), loaded, total }
        const anyP = p as { progress?: number; loaded?: number; total?: number; status?: string };
        if (typeof anyP.progress !== 'number') return;
        options.onProgress({
          pct: anyP.progress,
          bytesLoaded: anyP.loaded ?? 0,
          bytesTotal: anyP.total ?? 0,
        });
      },
    });
    return pipe as TokenClassificationPipeline;
  })();
  return pipelinePromise;
}

// 모델 NER 라벨 → PIICategory 매핑.
// Xenova/bert-base-NER 라벨: PER, ORG, LOC, MISC.
// 추후 KoELECTRA-small-v3-modu-ner의 라벨 셋(PER/LOC/ORG/POH/DATE/TIME...)에 맞춰 확장.
function mapLabel(label: string): PIICategory | null {
  const tag = label.replace(/^[BIES]-/, ''); // BIO/BIOES prefix 제거
  switch (tag) {
    case 'PER':
      return 'person_name';
    case 'ORG':
      return 'organization';
    case 'LOC':
      return 'address';
    case 'DATE':
      return 'date';
    default:
      return null;
  }
}

interface RawNerEntity {
  entity?: string;
  entity_group?: string;
  word: string;
  start?: number;
  end?: number;
  score: number;
}

const MIN_CONFIDENCE = 0.5;

// BERT WordPiece의 ## prefix(서브워드) 정리
function cleanWord(w: string): string {
  return w.replace(/##/g, '').replace(/\s+/g, ' ').trim();
}

export async function detectWithModel(text: string): Promise<PIISpan[]> {
  const pipe = await loadModel();
  // aggregation_strategy: 'simple' → BIO 토큰을 entity_group 단위로 합쳐 반환.
  // 일부 tokenizer는 aggregation 후 start/end를 누락 → indexOf walk로 복원.
  const raw = (await pipe(text, { aggregation_strategy: 'simple' })) as RawNerEntity[];
  const spans: PIISpan[] = [];
  let cursor = 0;
  for (const e of raw) {
    const category = mapLabel(e.entity_group ?? e.entity ?? '');
    if (!category) continue;
    if (e.score < MIN_CONFIDENCE) continue;

    let start = typeof e.start === 'number' ? e.start : -1;
    let end = typeof e.end === 'number' ? e.end : -1;

    if (start < 0 || end < 0) {
      // 모델이 offset을 안 줄 때: word를 cursor 이후 위치에서 indexOf 검색
      const cleaned = cleanWord(e.word);
      if (!cleaned) continue;
      const idx = text.indexOf(cleaned, cursor);
      if (idx < 0) continue;
      start = idx;
      end = idx + cleaned.length;
      cursor = end;
    }

    spans.push({
      start,
      end,
      text: text.slice(start, end),
      category,
      confidence: e.score,
      source: 'model',
    });
  }
  return spans;
}

export function getActiveModelId(): string | null {
  return activeModelId;
}
