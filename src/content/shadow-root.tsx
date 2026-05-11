// Shadow DOM 마운트 헬퍼.
// host 페이지 CSS와 격리된 React 트리를 띄우고, Radix Portal을 shadow 안에 가둔다.
// closed mode: host 페이지가 host.shadowRoot로 접근 못 하게 하여 노출 표면을 줄임.

import { createRoot, type Root } from 'react-dom/client';
import * as React from 'react';
import { PortalContainerProvider } from '@/shared/ui/portal-container';
import shadowCss from './shadow.css?inline';

const FONT_STYLE_ID = 'oi-filter-pretendard-font';
const HOST_ID = 'oi-filter-shadow-host';

/**
 * Radix Dialog/Focus-trap이 closed shadow DOM 안의 element를 찾지 못해 false-positive
 * 콘솔 노이즈를 출력하는 패턴 3가지:
 *   1. "DialogContent requires a DialogTitle…" — Radix가 document.getElementById로 검사
 *   2. "Missing Description or aria-describedby={undefined}" — 같은 원인
 *   3. "aria-hidden [object HTMLDivElement] in not contained inside HTMLBodyElement" —
 *      react-remove-scroll/focus-trap이 shadow root element를 body 자손이 아니라 판단
 *
 * 모두 우리 모달이 실제로는 정상 마운트되었고 (visible DialogTitle/Description 존재 +
 * Radix 자체 a11y 보장이 shadow root 안에서 작동) 기능에 영향 없는 워닝. 콘솔 노이즈만
 * 차단하기 위해 console.error를 한 번만 wrap하여 매칭 메시지만 swallow한다. 다른 모든
 * console.error는 그대로 통과 — host page(ChatGPT 등) 자체 워닝에는 영향 없음.
 */
const RADIX_FALSE_POSITIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /requires a `DialogTitle`/i,
  /aria-describedby=\{undefined\}/i,
  /aria-hidden .+ not contained inside/i,
];

let consoleErrorPatched = false;
function silenceShadowDomFalsePositives(): void {
  if (consoleErrorPatched) return;
  consoleErrorPatched = true;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      for (const re of RADIX_FALSE_POSITIVE_PATTERNS) {
        if (re.test(first)) return;
      }
    }
    original.apply(console, args);
  };
}

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

  silenceShadowDomFalsePositives();
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

  // Radix Dialog 등 a11y 검증은 useEffect에서 document.getElementById(titleId)로 element를
  // 찾는데, shadow root 안에 마운트된 element는 host document에서 안 보여 false-positive
  // console.error("DialogContent requires a DialogTitle…")가 출력된다. 워닝을 silence
  // 하기 위해 portal container에 추가되는 radix-* id를 document.body에 hidden span으로
  // 미러링한다. 기능 차단은 없지만 콘솔 노이즈 제거 + 외부 a11y tool과의 호환성도 향상.
  const idMirrors = new Map<string, HTMLElement>();
  const mirrorId = (id: string): void => {
    if (!id.startsWith('radix-') || idMirrors.has(id) || document.getElementById(id)) return;
    const decoy = document.createElement('span');
    decoy.id = id;
    decoy.setAttribute('aria-hidden', 'true');
    decoy.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);';
    document.body.appendChild(decoy);
    idMirrors.set(id, decoy);
  };
  const unmirrorId = (id: string): void => {
    const d = idMirrors.get(id);
    if (d) {
      d.remove();
      idMirrors.delete(id);
    }
  };
  const collectIds = (root: Element): string[] => {
    const out: string[] = [];
    if (root.id) out.push(root.id);
    root.querySelectorAll<HTMLElement>('[id^="radix-"]').forEach((el) => out.push(el.id));
    return out;
  };
  const idObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof Element) collectIds(node).forEach(mirrorId);
      });
      m.removedNodes.forEach((node) => {
        if (node instanceof Element) collectIds(node).forEach(unmirrorId);
      });
    }
  });
  idObserver.observe(portalContainer, { childList: true, subtree: true });

  const reactRoot = createRoot(reactHost);
  reactRoot.render(
    <React.StrictMode>
      <PortalContainerProvider container={portalContainer}>
        {render(portalContainer)}
      </PortalContainerProvider>
    </React.StrictMode>,
  );

  const unmount = () => {
    idObserver.disconnect();
    idMirrors.forEach((d) => d.remove());
    idMirrors.clear();
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
