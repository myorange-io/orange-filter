// Background Service Worker — 메시지 라우터 + Offscreen Document 관리.
// 추론은 SW에서 직접 수행하지 않고 Offscreen Document로 위임.
//
// 흐름:
//   DETECT_REQUEST → SW가 정규식(Tier 0) 즉시 실행
//                  → offscreen에 동일 요청 forward (Tier 1 모델)
//                  → 두 결과 병합·dedupe 후 호출자에게 반환
// 본격 라우터/병합은 S9, 여기서는 단순 합집합 + start 위치 기준 dedupe.

import { detectKoreanPII } from './pii/regex';
import { maskText } from './pii/mask';
import { mergeSpans } from './pii/merge';
import { filterNerFalsePositives } from './pii/ner-filter';
import { pickModel, type ModelTier, type UserMode } from './pii/router';
import { ALL_MODELS, getModelByTier, TIER1_DEFAULT } from '@/shared/models';
import type { DetectResult, PIISpan } from '@/shared/types';
import type { DetectResultMsg, ErrorMsg, Message } from '@/shared/messages';

// 다운로드 완료된 모델 ID 집합. offscreen → background로 download done 메시지 받을 때 갱신.
// 시작 시점에는 empty — offscreen은 첫 query 시 IndexedDB enumerate 후 보고.
const downloadedModelIds = new Set<string>([TIER1_DEFAULT.modelId]);

const MODEL_AVAILABILITY: Record<ModelTier, () => boolean> = {
  'tier1-default': () => true, // 항상 워밍업
  'tier2-multilingual': () => {
    const def = getModelByTier('tier2-multilingual');
    return !!def && def.shippable && downloadedModelIds.has(def.modelId);
  },
  'tier2-precision': () => {
    const def = getModelByTier('tier2-precision');
    return !!def && def.shippable && downloadedModelIds.has(def.modelId);
  },
};
const routerDeps = { hasModel: (t: ModelTier) => MODEL_AVAILABILITY[t]() };

function tierToModelId(tier: ModelTier): string {
  const def = ALL_MODELS.find((m) => m.tier === tier);
  return def?.modelId ?? TIER1_DEFAULT.modelId;
}

/** offscreen에서 다운로드 완료/캐시 enumerate 결과를 받아 가용성 갱신 */
function updateAvailability(modelIds: ReadonlyArray<string>): void {
  for (const id of modelIds) downloadedModelIds.add(id);
}

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['WORKERS' as chrome.offscreen.Reason],
    justification:
      '온디바이스 PII 탐지 모델 추론 — Service Worker 수명을 넘어 모델을 메모리에 유지하기 위함.',
  });
}

async function detectViaModel(text: string, modelId: string): Promise<PIISpan[]> {
  await ensureOffscreen();
  const requestId = crypto.randomUUID();
  return new Promise<PIISpan[]>((resolve, reject) => {
    chrome.runtime
      .sendMessage({
        kind: 'DETECT_REQUEST_INTERNAL',
        requestId,
        payload: { text, modelId },
      } satisfies Message)
      .then((response: DetectResultMsg | ErrorMsg | undefined) => {
        if (!response) {
          resolve([]);
          return;
        }
        if (response.kind === 'ERROR') {
          reject(new Error(response.payload.message));
          return;
        }
        if (response.kind === 'DETECT_RESULT') {
          resolve(response.payload.spans);
          return;
        }
        resolve([]);
      })
      .catch(reject);
  });
}

async function detect(text: string, userMode: UserMode = 'default'): Promise<DetectResult> {
  const regex = detectKoreanPII(text);
  const tier = pickModel(text, userMode, routerDeps);
  const modelId = tierToModelId(tier);
  console.debug('[npo-privacy] router →', tier, modelId);

  let model: PIISpan[] = [];
  try {
    model = await detectViaModel(text, modelId);
    // NER false positive 필터 — 짧은 영문 토큰('do'/'is')의 person_name 오인 차단.
    model = filterNerFalsePositives(model);
  } catch (err) {
    // 모델이 아직 로딩 중이거나 실패 — 정규식 결과만 사용.
    console.warn('[npo-privacy] model detect failed, regex-only:', err);
  }
  return { spans: mergeSpans(regex, model), textLength: text.length };
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.kind) {
    case 'PING':
      sendResponse({
        kind: 'PING',
        requestId: message.requestId,
        inResponseTo: message.requestId,
        payload: null,
      } satisfies Message);
      return false;

    case 'DETECT_REQUEST': {
      detect(message.payload.text, message.payload.userMode).then((result) => {
        sendResponse({
          kind: 'DETECT_RESULT',
          requestId: crypto.randomUUID(),
          inResponseTo: message.requestId,
          payload: result,
        } satisfies Message);
      });
      return true; // async response
    }

    case 'MASK_REQUEST': {
      const { text, detectResult, modeByCategory, enabledByCategory, enabledSpanKeys } =
        message.payload;
      const result = maskText(text, detectResult.spans, {
        modeByCategory,
        enabledByCategory,
        enabledSpanKeys: enabledSpanKeys ? new Set(enabledSpanKeys) : undefined,
      });
      sendResponse({
        kind: 'MASK_RESULT',
        requestId: crypto.randomUUID(),
        inResponseTo: message.requestId,
        payload: {
          text: result.text,
          appliedCount: result.applied.length,
          skippedCount: result.skipped.length,
        },
      } satisfies Message);
      return false;
    }

    case 'MODEL_DOWNLOAD_REQUEST': {
      // public → internal 변환. offscreen만 INTERNAL을 listen, 무한 루프 방지.
      const reqId = message.requestId;
      void ensureOffscreen().then(() => {
        chrome.runtime
          .sendMessage({
            kind: 'MODEL_DOWNLOAD_REQUEST_INTERNAL',
            requestId: reqId,
            payload: message.payload,
          } satisfies Message)
          .then((response) => {
            if (response?.kind === 'MODEL_DOWNLOAD_RESULT' && response.payload.ok) {
              updateAvailability([response.payload.modelId]);
            }
            sendResponse(response);
          })
          .catch((err: unknown) => {
            sendResponse({
              kind: 'ERROR',
              requestId: crypto.randomUUID(),
              inResponseTo: reqId,
              payload: {
                code: 'MODEL_FORWARD_FAILED',
                message: err instanceof Error ? err.message : String(err),
              },
            } satisfies Message);
          });
      });
      return true;
    }

    case 'MODEL_DOWNLOAD_CANCEL': {
      const reqId = message.requestId;
      void ensureOffscreen().then(() => {
        chrome.runtime
          .sendMessage({
            kind: 'MODEL_DOWNLOAD_CANCEL_INTERNAL',
            requestId: reqId,
            payload: message.payload,
          } satisfies Message)
          .then((response) => sendResponse(response))
          .catch((err: unknown) => {
            sendResponse({
              kind: 'ERROR',
              requestId: crypto.randomUUID(),
              inResponseTo: reqId,
              payload: {
                code: 'MODEL_CANCEL_FAILED',
                message: err instanceof Error ? err.message : String(err),
              },
            } satisfies Message);
          });
      });
      return true;
    }

    case 'MODEL_STATUS': {
      const reqId = message.requestId;
      void ensureOffscreen().then(() => {
        chrome.runtime
          .sendMessage({
            kind: 'MODEL_STATUS_INTERNAL',
            requestId: reqId,
            payload: null,
          } satisfies Message)
          .then((response) => {
            if (response?.kind === 'MODEL_STATUS') {
              updateAvailability(response.payload.cachedModels);
            }
            sendResponse(response);
          })
          .catch((err: unknown) => {
            sendResponse({
              kind: 'ERROR',
              requestId: crypto.randomUUID(),
              inResponseTo: reqId,
              payload: {
                code: 'MODEL_STATUS_FAILED',
                message: err instanceof Error ? err.message : String(err),
              },
            } satisfies Message);
          });
      });
      return true;
    }

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // 일부 Chrome 버전에서 미지원 — 무시
    });
  // 설치 직후 offscreen lazy-init (모델 워밍업)
  void ensureOffscreen();

  // 첫 설치에서만 환영 탭 — update / chrome_update / shared_module_update 시엔 열지 않음.
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/welcome/welcome.html'),
    });
  }
});
