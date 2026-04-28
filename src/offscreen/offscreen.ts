// Offscreen Document — Tier 1+ 모델 추론 호스트.
// MV3 Service Worker는 ~30s 후 evict되고 WebGPU 지원이 불안정하므로 모델은 여기서 유지.

import {
  cancelDownload,
  detectWithModel,
  downloadModel,
  getActiveModelId,
  listCachedModels,
} from './model-runtime';
import type { Message, ModelDownloadProgress } from '@/shared/messages';

console.log('[npo-privacy] offscreen ready');

// Background에 ready 신호
chrome.runtime
  .sendMessage({
    kind: 'OFFSCREEN_READY',
    requestId: crypto.randomUUID(),
    payload: null,
  } satisfies Message)
  .catch(() => {
    /* listener 미준비 — 무시 */
  });

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.kind) {
    case 'PING':
      sendResponse({
        kind: 'PING',
        requestId: crypto.randomUUID(),
        inResponseTo: message.requestId,
        payload: null,
      } satisfies Message);
      return false;

    case 'DETECT_REQUEST_INTERNAL': {
      // background 전용 라우팅. UI에서 직접 보내지 않음.
      const text = message.payload.text;
      const modelId = message.payload.modelId;
      detectWithModel(text, modelId)
        .then((spans) => {
          sendResponse({
            kind: 'DETECT_RESULT',
            requestId: crypto.randomUUID(),
            inResponseTo: message.requestId,
            payload: { spans, textLength: text.length },
          } satisfies Message);
        })
        .catch((err: unknown) => {
          sendResponse({
            kind: 'ERROR',
            requestId: crypto.randomUUID(),
            inResponseTo: message.requestId,
            payload: {
              code: 'MODEL_INFER_FAILED',
              message: err instanceof Error ? err.message : String(err),
            },
          } satisfies Message);
        });
      return true; // async
    }

    case 'MODEL_STATUS_INTERNAL':
      void listCachedModels().then((cachedModels) => {
        sendResponse({
          kind: 'MODEL_STATUS',
          requestId: crypto.randomUUID(),
          inResponseTo: message.requestId,
          payload: {
            activeModelId: getActiveModelId(),
            cachedModels,
            ready: getActiveModelId() !== null,
          },
        } satisfies Message);
      });
      return true; // async

    case 'MODEL_DOWNLOAD_REQUEST_INTERNAL': {
      const { modelId } = message.payload;
      const requestId = message.requestId;
      // 진행률 broadcast — 동일 requestId로 SW 또는 sidepanel이 listen.
      const broadcast = (
        payload: ModelDownloadProgress['payload'],
      ) => {
        void chrome.runtime
          .sendMessage({
            kind: 'MODEL_DOWNLOAD_PROGRESS',
            requestId: crypto.randomUUID(),
            inResponseTo: requestId,
            payload,
          } satisfies Message)
          .catch(() => {
            /* listener 없을 수 있음 — 무시 */
          });
      };
      downloadModel(modelId, (p) => {
        broadcast({
          modelId,
          pct: p.pct,
          bytesLoaded: p.bytesLoaded,
          bytesTotal: p.bytesTotal,
          phase: p.phase,
          file: p.file,
        });
      })
        .then((result) => {
          sendResponse({
            kind: 'MODEL_DOWNLOAD_RESULT',
            requestId: crypto.randomUUID(),
            inResponseTo: requestId,
            payload: { modelId, ok: result.ok, error: result.error },
          } satisfies Message);
        })
        .catch((err: unknown) => {
          sendResponse({
            kind: 'MODEL_DOWNLOAD_RESULT',
            requestId: crypto.randomUUID(),
            inResponseTo: requestId,
            payload: {
              modelId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
          } satisfies Message);
        });
      return true;
    }

    case 'MODEL_DOWNLOAD_CANCEL_INTERNAL': {
      const cancelled = cancelDownload(message.payload.modelId);
      sendResponse({
        kind: 'MODEL_DOWNLOAD_RESULT',
        requestId: crypto.randomUUID(),
        inResponseTo: message.requestId,
        payload: {
          modelId: message.payload.modelId,
          ok: cancelled,
          error: cancelled ? undefined : 'no-active-download',
        },
      } satisfies Message);
      return false;
    }

    default:
      return false;
  }
});

// 자동 워밍업 없음 — 사용자가 사이드패널에서 명시적으로 "받기" 클릭해야 다운로드 시작.
// 이미 IndexedDB에 캐시된 경우 첫 paste 시 loadModel()이 즉시 반환 (네트워크 X).
