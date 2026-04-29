// SiteAdapter 공통 팩토리 — paste 이벤트 capture-phase 후킹 + isInput 술어로 분기.
// 사이트별 어댑터는 hosts + isInput만 다르고 paste/주입 로직은 동일.
//
// listener는 window와 document 양쪽에 capture phase로 등록한다. window는 가장 외부라
// SPA 또는 closed shadow root 안 capture handler에 가려지더라도 paste를 잡을 수 있다.
// 같은 paste 이벤트가 두 listener에 모두 도달하므로 `defaultPrevented` 가드로 중복 처리 방지.

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
        // 다른 listener가 이미 처리한 paste — skip (window+document 중복 호출 방지)
        if (evt.defaultPrevented) return;
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
      // window가 가장 외부 — SPA의 capture handler에 가려지지 않음.
      // document fallback — 일부 환경(legacy WebView 등)에서 window paste 미전파 대비.
      window.addEventListener('paste', handler, true);
      document.addEventListener('paste', handler, true);
      return () => {
        window.removeEventListener('paste', handler, true);
        document.removeEventListener('paste', handler, true);
      };
    },
  };
}
