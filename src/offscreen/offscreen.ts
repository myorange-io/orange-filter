// Offscreen Document — Tier 1+ 모델 추론 호스트.
// MV3 Service Worker는 ~30s 후 evict되고 WebGPU 지원이 불안정하므로 모델은 여기서 유지.

import { detectWithModel, loadModel, getActiveModelId } from './model-runtime';
import type { Message } from '@/shared/messages';

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

    case 'DETECT_REQUEST': {
      // 모델만 담당 (정규식은 SW에서 별도). 결과 spans를 SW에 반환.
      detectWithModel(message.payload.text)
        .then((spans) => {
          sendResponse({
            kind: 'DETECT_RESULT',
            requestId: crypto.randomUUID(),
            inResponseTo: message.requestId,
            payload: { spans, textLength: message.payload.text.length },
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

    case 'MODEL_STATUS':
      sendResponse({
        kind: 'MODEL_STATUS',
        requestId: crypto.randomUUID(),
        inResponseTo: message.requestId,
        payload: {
          activeModelId: getActiveModelId(),
          cachedModels: [], // S15에서 IndexedDB enumerate
          ready: getActiveModelId() !== null,
        },
      } satisfies Message);
      return false;

    default:
      return false;
  }
});

// 워밍업 — 백그라운드 진입과 동시에 모델 로드 시작 (첫 paste 지연 감소).
void loadModel().catch((err) => {
  console.warn('[npo-privacy] model warmup failed:', err);
});
