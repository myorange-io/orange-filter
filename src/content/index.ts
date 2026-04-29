// Content Script — 도메인 매칭 → 사이트 어댑터 → paste 후킹 → Shadow DOM paste 모달.
// 테스트 페이지에서도 모달을 직접 트리거할 수 있도록 window CustomEvent도 지원.

import { findAdapter } from './site-adapters';
import { showPasteModal } from './show-paste-modal';
import { unmountShadow } from './shadow-root';
import { requestDetect } from '@/shared/lib/detect-client';
import { isDomainWhitelisted, loadSettings, subscribeSettings } from '@/shared/settings';
import type { DetectResult } from '@/shared/types';

interface TriggerDetail {
  text: string;
  detectResult?: DetectResult;
  onConfirm?: (maskedText: string) => void;
  onCancel?: () => void;
}

// 1) 도메인 매칭 — 적용 가능 어댑터가 있으면 paste 후킹 등록
const adapter = findAdapter(location.hostname);
if (adapter) {
  console.log('[npo-privacy] adapter installed:', adapter.id);

  // 모델 사전 워밍업 — 페이지 진입 시 background에 dummy detect 1회 보내서
  // offscreen이 IndexedDB에서 모델을 메모리로 사전 로드하게 한다. 첫 paste의
  // 5s wait를 제거. 미설치 사용자는 정규식 폴백이라 영향 없음. 결과는 무시.
  void requestDetect(' ').catch(() => { /* warmup failure 무시 */ });

  let whitelisted = false;
  void loadSettings().then((s) => {
    whitelisted = isDomainWhitelisted(s, location.hostname);
  });
  subscribeSettings((s) => {
    whitelisted = isDomainWhitelisted(s, location.hostname);
  });
  adapter.install((ctx) => {
    if (whitelisted) {
      // 화이트리스트 도메인 — 가로채지 않고 원본 그대로
      ctx.proceedAsIs();
      return;
    }
    // showPasteModal은 background DETECT_REQUEST를 await하므로 비동기.
    // paste handler는 이미 preventDefault 했으므로 modal이 늦게 떠도 입력엔 안 들어감.
    void showPasteModal({
      text: ctx.text,
      onConfirm: (masked) => ctx.replaceWith(masked),
      onCancel: () => ctx.cancel(),
    });
  });
} else {
  console.log('[npo-privacy] no adapter for', location.hostname);
}

// 2) 테스트/외부 트리거 — window CustomEvent로 모달 직접 띄우기
window.addEventListener('oi-filter:show-paste-modal', (e) => {
  const ev = e as CustomEvent<TriggerDetail>;
  const detail = ev.detail;
  if (!detail) return;
  void showPasteModal({
    text: detail.text,
    detectResult: detail.detectResult,
    onConfirm: (masked) => detail.onConfirm?.(masked),
    onCancel: () => detail.onCancel?.(),
  });
});

window.addEventListener('oi-filter:hide-paste-modal', () => unmountShadow());
