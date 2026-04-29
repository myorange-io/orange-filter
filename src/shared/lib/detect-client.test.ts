// detect-client 단위 테스트.
// chrome.runtime이 없는 환경에서 정규식 폴백 검증, sendMessage 응답 정상 처리,
// timeout 시 폴백 동작 검증.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDetect } from './detect-client';

const KOREAN_PII_TEXT = '연락처 010-1234-5678 / 이메일 user@example.com';

describe('requestDetect — chrome.runtime 폴백', () => {
  beforeEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('chrome.runtime 없음 → 정규식 폴백 결과 반환', async () => {
    const result = await requestDetect(KOREAN_PII_TEXT);
    // 정규식이 mobile + email 두 개 잡음
    expect(result.spans.length).toBeGreaterThanOrEqual(2);
    expect(result.spans.some((s) => s.category === 'mobile')).toBe(true);
    expect(result.spans.some((s) => s.category === 'email')).toBe(true);
    expect(result.textLength).toBe(KOREAN_PII_TEXT.length);
  });

  it('빈 텍스트 → 빈 스팬', async () => {
    const result = await requestDetect('');
    expect(result.spans).toEqual([]);
    expect(result.textLength).toBe(0);
  });
});

describe('requestDetect — chrome.runtime 사용', () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    // 테스트용 chrome 글로벌 stub — runtime.sendMessage만 필요하므로 unknown cast
    (globalThis as unknown as { chrome: { runtime: { sendMessage: typeof sendMessageMock } } }).chrome = {
      runtime: { sendMessage: sendMessageMock },
    };
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('background DETECT_RESULT 응답 → 그대로 반환', async () => {
    sendMessageMock.mockResolvedValue({
      kind: 'DETECT_RESULT',
      requestId: 'r1',
      inResponseTo: 'r0',
      payload: {
        spans: [
          {
            start: 0,
            end: 3,
            text: '김철수',
            category: 'person_name',
            confidence: 0.92,
            source: 'model',
          },
        ],
        textLength: 3,
      },
    });
    const result = await requestDetect('김철수');
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]?.source).toBe('model');
  });

  it('background ERROR 응답 → 정규식 폴백', async () => {
    sendMessageMock.mockResolvedValue({
      kind: 'ERROR',
      requestId: 'r1',
      inResponseTo: 'r0',
      payload: { code: 'X', message: 'fail' },
    });
    const result = await requestDetect(KOREAN_PII_TEXT);
    expect(result.spans.length).toBeGreaterThanOrEqual(2);
    // 폴백이라 source: regex
    expect(result.spans.every((s) => s.source === 'regex')).toBe(true);
  });

  it('sendMessage 예외 → 정규식 폴백', async () => {
    sendMessageMock.mockRejectedValue(new Error('disconnected'));
    const result = await requestDetect(KOREAN_PII_TEXT);
    expect(result.spans.length).toBeGreaterThanOrEqual(2);
    expect(result.spans.every((s) => s.source === 'regex')).toBe(true);
  });

  it('timeout 시 정규식 폴백', async () => {
    // sendMessage가 영원히 resolve 안 됨
    sendMessageMock.mockImplementation(() => new Promise(() => {}));
    const result = await requestDetect(KOREAN_PII_TEXT, { timeoutMs: 50 });
    expect(result.spans.length).toBeGreaterThanOrEqual(2);
    expect(result.spans.every((s) => s.source === 'regex')).toBe(true);
  });
});
