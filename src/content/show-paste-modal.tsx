// PasteModal을 Shadow DOM에 띄우고 사용자 결정을 callback으로 전달하는 헬퍼.
// site-adapter (chatgpt.ts) + 테스트 페이지(test.tsx) 양쪽에서 사용.

import * as React from 'react';
import { detectKoreanPII } from '@/background/pii/regex';
import type { DetectResult } from '@/shared/types';
import { mountShadow, unmountShadow } from './shadow-root';
import { PasteModal } from './PasteModal';

function resolveFontUrl(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('fonts/PretendardVariable.woff2')
    : '/fonts/PretendardVariable.woff2';
}

export interface ShowOptions {
  text: string;
  /** 외부에서 미리 계산한 detectResult를 주입 가능. 없으면 정규식만 즉석 실행 */
  detectResult?: DetectResult;
  onConfirm: (maskedText: string) => void;
  onCancel: () => void;
}

export function showPasteModal(options: ShowOptions): void {
  const detectResult: DetectResult =
    options.detectResult ?? {
      spans: detectKoreanPII(options.text),
      textLength: options.text.length,
    };

  // PII 0건이면 모달 띄우지 않고 그대로 통과.
  if (detectResult.spans.length === 0) {
    options.onConfirm(options.text);
    return;
  }

  const close = () => unmountShadow();

  mountShadow(
    () =>
      React.createElement(PasteModal, {
        open: true,
        onOpenChange: (open) => {
          if (!open) {
            options.onCancel();
            close();
          }
        },
        text: options.text,
        detectResult,
        onConfirm: (masked) => {
          options.onConfirm(masked);
          close();
        },
        onCancel: () => {
          options.onCancel();
        },
      }),
    { fontUrl: resolveFontUrl() },
  );
}
