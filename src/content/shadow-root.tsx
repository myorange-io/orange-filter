// Shadow DOM 마운트 헬퍼.
// host 페이지 CSS와 격리된 React 트리를 띄우고, Radix Portal을 shadow 안에 가둔다.
// closed mode: host 페이지가 host.shadowRoot로 접근 못 하게 하여 노출 표면을 줄임.

import { createRoot, type Root } from 'react-dom/client';
import * as React from 'react';
import { PortalContainerProvider } from '@/shared/ui/portal-container';
import shadowCss from './shadow.css?inline';

const FONT_STYLE_ID = 'oi-filter-pretendard-font';
const HOST_ID = 'oi-filter-shadow-host';

interface MountedShadow {
  host: HTMLElement;
  reactRoot: Root;
  unmount: () => void;
}

let active: MountedShadow | null = null;

function injectFontOnce(fontUrl: string): void {
  if (document.getElementById(FONT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: 'Pretendard Variable';
      font-weight: 45 920;
      font-style: normal;
      font-display: swap;
      src: url('${fontUrl}') format('woff2-variations');
    }
  `;
  document.head.appendChild(style);
}

interface MountOptions {
  /** Pretendard woff2 URL — content script는 chrome.runtime.getURL로 주입.
   *  test page에서는 상대 경로(/fonts/...) 그대로 가능. */
  fontUrl: string;
  /** 호스트 페이지의 어디에 host element를 붙일지. 기본은 document.documentElement */
  attachTo?: Element;
}

export function mountShadow(
  render: (portalContainer: HTMLElement) => React.ReactNode,
  options: MountOptions,
): MountedShadow {
  if (active) {
    // 중복 마운트 방지 — 이미 떠 있으면 그 인스턴스를 그대로 반환.
    return active;
  }

  injectFontOnce(options.fontUrl);

  const host = document.createElement('div');
  host.id = HOST_ID;
  // host 자체는 viewport 0×0, 자식들이 position:fixed로 화면을 덮음.
  // z-index는 max라 호스트 페이지 위에 항상 뜸.
  host.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 2147483647;';

  const parent = options.attachTo ?? document.documentElement;
  parent.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  const styleEl = document.createElement('style');
  styleEl.textContent = shadowCss;
  shadow.appendChild(styleEl);

  // Radix Portal이 escape 하지 않도록 portal container를 shadow 내부에 둔다.
  const portalContainer = document.createElement('div');
  portalContainer.id = 'oi-portal-container';
  shadow.appendChild(portalContainer);

  const reactHost = document.createElement('div');
  reactHost.id = 'oi-react-root';
  shadow.appendChild(reactHost);

  const reactRoot = createRoot(reactHost);
  reactRoot.render(
    <React.StrictMode>
      <PortalContainerProvider container={portalContainer}>
        {render(portalContainer)}
      </PortalContainerProvider>
    </React.StrictMode>,
  );

  const unmount = () => {
    reactRoot.unmount();
    host.remove();
    active = null;
  };

  active = { host, reactRoot, unmount };
  return active;
}

export function unmountShadow(): void {
  active?.unmount();
}
