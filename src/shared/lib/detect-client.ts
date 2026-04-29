// Background DETECT_REQUEST 클라이언트.
// content script / sidepanel에서 background SW로 detect 요청을 보내고
// 정규식 + NER 모델 합산 결과를 받는다.
//
// chrome.runtime이 없는 환경(테스트 페이지, vite dev)에서는 정규식 폴백.

import { detectKoreanPII } from '@/background/pii/regex';
import type { Message } from '@/shared/messages';
import type { DetectResult } from '@/shared/types';

const hasChromeRuntime = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

export interface DetectOptions {
  userMode?: 'default' | 'multilingual' | 'precision_high';
  /** 메시지 응답 timeout (ms). 기본 5000. background 모델 로드 첫 호출은 더 걸릴 수 있음. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 8000;

/**
 * background에 DETECT_REQUEST를 보내고 결과를 await.
 * 실패(타임아웃, runtime 없음, background 응답 비정상) 시 정규식 폴백 결과 반환.
 *
 * 정규식 폴백은 호출자(paste 후킹/sidepanel 마스킹)가 모델 미설치 사용자에게도
 * 최소한의 보호를 받게 하기 위함.
 */
export async function requestDetect(
  text: string,
  options: DetectOptions = {},
): Promise<DetectResult> {
  if (!hasChromeRuntime()) {
    return regexFallback(text);
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const reqId = crypto.randomUUID();

  try {
    const response = await Promise.race<Message | undefined>([
      chrome.runtime.sendMessage({
        kind: 'DETECT_REQUEST',
        requestId: reqId,
        payload: { text, userMode: options.userMode },
      } satisfies Message),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);

    if (response?.kind === 'DETECT_RESULT') {
      return response.payload;
    }
    // background 응답이 없거나 ERROR — 정규식 폴백
    return regexFallback(text);
  } catch {
    return regexFallback(text);
  }
}

function regexFallback(text: string): DetectResult {
  return { spans: detectKoreanPII(text), textLength: text.length };
}
