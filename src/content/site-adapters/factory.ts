// SiteAdapter 공통 팩토리 — paste 이벤트 capture-phase 후킹 + isInput 술어로 분기.
// 사이트별 어댑터는 hosts + isInput만 다르고 paste/주입 로직은 동일.

import type { PasteContext, SiteAdapter } from './types';
import { insertIntoElement } from './text-injection';

export interface AdapterConfig {
  id: string;
  hosts: string[];
  /** target이 이 사이트의 LLM 입력 요소인지 판별 */
  isInput(target: HTMLElement): boolean;
}

export function createPasteAdapter(config: AdapterConfig): SiteAdapter {
  return {
    id: config.id,
    matches: (hostname) =>
      config.hosts.some((h) => hostname === h || hostname.endsWith('.' + h)),
    install(onPaste) {
      const handler = (e: Event) => {
        const evt = e as ClipboardEvent;
        if (!(evt.target instanceof HTMLElement)) return;
        if (!config.isInput(evt.target)) return;
        const text = evt.clipboardData?.getData('text/plain') ?? '';
        if (!text) return;

        evt.preventDefault();
        evt.stopPropagation();

        const target = evt.target;
        const ctx: PasteContext = {
          text,
          proceedAsIs: () => insertIntoElement(target, text),
          replaceWith: (masked) => insertIntoElement(target, masked),
          cancel: () => {
            /* no-op — 사용자가 다시 paste 가능 */
          },
        };
        onPaste(ctx);
      };
      document.addEventListener('paste', handler, true);
      return () => document.removeEventListener('paste', handler, true);
    },
  };
}
