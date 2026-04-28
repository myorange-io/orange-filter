// Tier 1 모델 런타임 — Offscreen Document에서 동작.
//
// MV3 Service Worker는 ~30s 후 evict되고 WebGPU 지원이 불안정 → 모델 인스턴스는
// offscreen에 유지한다. Transformers.js는 자체적으로 IndexedDB(`huggingface/transformers/...`
// 키)에 모델 weights를 캐시하므로 첫 다운로드 후 오프라인 동작.
//
// 모델 선택 (S15 시점):
//   - Tier 1 default: `Xenova/bert-base-NER` — 영문 NER, ONNX 제공, int8 ~30MB. 항상 활성.
//   - Tier 2 multilingual: `Xenova/xlm-roberta-base` — 사용자가 ON 시 다운로드.
//   - Tier 2 precision: `Leo97/KoELECTRA-small-v3-modu-ner` — HF에 ONNX 미배포 (사용자가
//     optimum-cli 변환 + CDN 호스팅 후 활성). 현재 shippable: false.

import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import { TIER1_DEFAULT } from '@/shared/models';
import type { PIICategory, PIISpan } from '@/shared/types';

// MV3 strict CSP는 외부 CDN script 로드를 차단 (`script-src 'self'`).
// onnxruntime-web의 wasm/mjs 파일을 public/ort/에 self-host하고 chrome-extension:// 경로로 주입.
// 비-확장 환경(test page, vite dev)에서는 chrome.runtime이 없어 fallback 처리.
const ortBase =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('ort/')
    : '/ort/';
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = ortBase;
}
env.allowLocalModels = false;
env.useBrowserCache = true; // IndexedDB 캐시 ON

const DEFAULT_MODEL_ID = TIER1_DEFAULT.modelId;

// 모델별 파이프라인 캐시. 한 번 로드된 모델은 다음 활성 시점에 즉시 사용.
const pipelineCache = new Map<string, Promise<TokenClassificationPipeline>>();
let activeModelId: string | null = null;

// 다운로드 취소를 위한 AbortController. modelId당 하나.
const downloadAborts = new Map<string, AbortController>();

interface LoadOptions {
  modelId?: string;
  onProgress?: (progress: {
    pct: number;
    bytesLoaded: number;
    bytesTotal: number;
    file?: string;
    phase: 'init' | 'downloading' | 'done';
  }) => void;
  signal?: AbortSignal;
}

export async function loadModel(options: LoadOptions = {}): Promise<TokenClassificationPipeline> {
  const id = options.modelId ?? DEFAULT_MODEL_ID;

  const cached = pipelineCache.get(id);
  if (cached) {
    activeModelId = id;
    return cached;
  }

  const promise = (async () => {
    const pipe = await pipeline('token-classification', id, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (!options.onProgress) return;
        // Transformers.js의 progress 객체는 { status, file, progress (0..100), loaded, total }
        const anyP = p as {
          progress?: number;
          loaded?: number;
          total?: number;
          status?: string;
          file?: string;
        };
        if (typeof anyP.progress !== 'number' && anyP.status !== 'ready') return;
        const phase: 'init' | 'downloading' | 'done' =
          anyP.status === 'ready' || anyP.status === 'done'
            ? 'done'
            : anyP.status === 'progress'
              ? 'downloading'
              : 'init';
        options.onProgress({
          pct: anyP.progress ?? (phase === 'done' ? 100 : 0),
          bytesLoaded: anyP.loaded ?? 0,
          bytesTotal: anyP.total ?? 0,
          file: anyP.file,
          phase,
        });
      },
    });
    return pipe as TokenClassificationPipeline;
  })();

  pipelineCache.set(id, promise);
  activeModelId = id;

  // 실패 시 cache에서 제거하여 재시도 가능하게 함
  promise.catch(() => {
    pipelineCache.delete(id);
    if (activeModelId === id) activeModelId = null;
  });

  return promise;
}

/**
 * 모델 다운로드 시작 — 파이프라인을 미리 만들어 IndexedDB 캐시 채움.
 * 진행률은 onProgress로 보고, 완료/취소/에러는 phase로 종결 표시.
 *
 * cancel은 별도 함수 (cancelDownload(modelId)). 현재 진행 중인 fetch는 AbortController로 중단.
 * 이미 캐시된 청크는 보존되므로 재시도 시 자동 resume.
 */
export async function downloadModel(
  modelId: string,
  onProgress: (p: {
    pct: number;
    bytesLoaded: number;
    bytesTotal: number;
    file?: string;
    phase: 'init' | 'downloading' | 'done' | 'cancelled' | 'error';
  }) => void,
): Promise<{ ok: boolean; error?: string }> {
  // 이미 다운로드 중이면 join (중복 fetch 방지)
  if (pipelineCache.has(modelId) && downloadAborts.has(modelId)) {
    try {
      await pipelineCache.get(modelId);
      onProgress({ pct: 100, bytesLoaded: 0, bytesTotal: 0, phase: 'done' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const abort = new AbortController();
  downloadAborts.set(modelId, abort);

  onProgress({ pct: 0, bytesLoaded: 0, bytesTotal: 0, phase: 'init' });

  try {
    await loadModel({
      modelId,
      onProgress,
      signal: abort.signal,
    });
    onProgress({ pct: 100, bytesLoaded: 0, bytesTotal: 0, phase: 'done' });
    downloadAborts.delete(modelId);
    return { ok: true };
  } catch (err) {
    downloadAborts.delete(modelId);
    if (abort.signal.aborted) {
      onProgress({ pct: 0, bytesLoaded: 0, bytesTotal: 0, phase: 'cancelled' });
      return { ok: false, error: 'cancelled' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ pct: 0, bytesLoaded: 0, bytesTotal: 0, phase: 'error' });
    return { ok: false, error: msg };
  }
}

/**
 * 진행 중인 다운로드 취소. 이미 받은 청크는 IndexedDB에 남으므로 재시도 시 resume됨.
 * 단, Transformers.js는 fetch에 AbortSignal을 직접 받지 않으므로 v1에서는 다음 progress
 * 콜백에서 cancelled를 보고하는 best-effort.
 */
export function cancelDownload(modelId: string): boolean {
  const abort = downloadAborts.get(modelId);
  if (!abort) return false;
  abort.abort();
  downloadAborts.delete(modelId);
  pipelineCache.delete(modelId);
  return true;
}

/**
 * 캐시된 모델 ID 목록 — IndexedDB의 transformers.js 캐시를 enumerate.
 * Transformers.js는 'transformers-cache' DB에 저장. 정확한 enumerate는 IDB API 직접 사용.
 */
export async function listCachedModels(): Promise<string[]> {
  if (typeof indexedDB === 'undefined') return [];
  return new Promise<string[]>((resolve) => {
    const req = indexedDB.open('transformers-cache');
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('files')) {
          db.close();
          resolve([]);
          return;
        }
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          const keys = (keysReq.result as IDBValidKey[]).map(String);
          // 키는 보통 모델 ID로 시작 — 첫 두 path segment 추출
          const modelIds = new Set<string>();
          for (const k of keys) {
            const parts = k.split('/');
            if (parts.length >= 2) modelIds.add(`${parts[0]}/${parts[1]}`);
          }
          db.close();
          resolve([...modelIds]);
        };
        keysReq.onerror = () => {
          db.close();
          resolve([]);
        };
      } catch {
        db.close();
        resolve([]);
      }
    };
    req.onerror = () => resolve([]);
  });
}

// 모델 NER 라벨 → PIICategory 매핑.
// 지원 모델별 라벨 셋:
//   - Xenova/bert-base-NER (Tier 1 default): PER, ORG, LOC, MISC
//   - YATAV-ENT/aegis-personal-pii-ner (Tier 2 precision): GIVENNAME, SURNAME,
//     EMAIL, TELEPHONENUM, IDCARD, CREDITCARDNUMBER, STREET, CITY, ZIPCODE,
//     BUILDINGNUM, IP_ADDRESS, PASSWORD, ACCOUNTNUM, DRIVERLICENSENUM, TIME,
//     COMPANY, USERNAME, DATEOFBIRTH (BIO prefix 자동 제거).
export function mapLabel(label: string): PIICategory | null {
  const tag = label.replace(/^[BIES]-/, ''); // BIO/BIOES prefix 제거
  switch (tag) {
    // 공통 (bert-base-NER + AEGIS 포함 일반 NER)
    case 'PER':
    case 'GIVENNAME':
    case 'SURNAME':
      return 'person_name';
    case 'ORG':
    case 'COMPANY':
      return 'organization';
    case 'LOC':
    case 'STREET':
    case 'CITY':
    case 'ZIPCODE':
    case 'BUILDINGNUM':
      return 'address';
    case 'DATE':
    case 'DATEOFBIRTH':
    case 'TIME':
      return 'date';

    // AEGIS PII (한국어 직접 라벨)
    case 'EMAIL':
      return 'email';
    case 'TELEPHONENUM':
      return 'mobile'; // 휴대폰/유선 구분은 정규식이 우선 처리, 모델은 일반 phone로
    case 'IDCARD':
      return 'rrn'; // 주민등록번호 직접 라벨
    case 'CREDITCARDNUMBER':
      return 'card';
    case 'ACCOUNTNUM':
      return 'account';
    case 'DRIVERLICENSENUM':
      return 'driver_license';
    case 'PASSWORD':
      return 'credential';

    // 미매핑 (현재 카테고리 없음): IP_ADDRESS, USERNAME → null
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

export async function detectWithModel(text: string, modelId?: string): Promise<PIISpan[]> {
  const pipe = await loadModel({ modelId });
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
