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
import { pickModel, type ModelTier, type UserMode } from './pii/router';
import type { DetectResult, PIISpan } from '@/shared/types';
import type { DetectResultMsg, ErrorMsg, Message } from '@/shared/messages';

// v1: Tier 1만 활성. Tier 2는 S15에서 사용자 다운로드 후 활성화.
const MODEL_AVAILABILITY: Record<ModelTier, boolean> = {
  'tier1-default': true,
  'tier2-multilingual': false,
  'tier2-precision': false,
};
const routerDeps = { hasModel: (t: ModelTier) => MODEL_AVAILABILITY[t] };

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

async function detectViaModel(text: string): Promise<PIISpan[]> {
  await ensureOffscreen();
  const requestId = crypto.randomUUID();
  return new Promise<PIISpan[]>((resolve, reject) => {
    chrome.runtime
      .sendMessage({
        kind: 'DETECT_REQUEST',
        requestId,
        payload: { text },
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
  // v1: tier 결정은 로깅만. 실제 모델 swap은 S15에서 확장.
  console.debug('[npo-privacy] router →', tier);

  let model: PIISpan[] = [];
  try {
    model = await detectViaModel(text);
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

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // 일부 Chrome 버전에서 미지원 — 무시
    });
  // 설치 직후 offscreen lazy-init (모델 워밍업)
  void ensureOffscreen();
});
