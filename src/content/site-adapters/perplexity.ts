// Perplexity 어댑터 — perplexity.ai / www.perplexity.ai.
// 2026 Q2 기준 메인 입력란이 textarea → div contenteditable(role=textbox)로 변경되어
// 두 케이스 모두 매치한다. 페이지 다른 입력(피드백 등)은 컨텍스트로 제외.
import { createPasteAdapter } from './factory';

export const perplexityAdapter = createPasteAdapter({
  id: 'perplexity',
  hosts: ['perplexity.ai'],
  isInput(target) {
    // 신버전: contenteditable div (role=textbox). 입력창은 form 또는 main 영역 안에 있음.
    const editable = target.closest('[contenteditable="true"]');
    if (editable instanceof HTMLElement) {
      if (editable.matches('[role="textbox"]')) return true;
      if (editable.closest('form')) return true;
      const label = (editable.getAttribute('aria-label') ?? '').toLowerCase();
      const placeholder = (editable.getAttribute('aria-placeholder') ?? editable.getAttribute('placeholder') ?? '').toLowerCase();
      if (label.includes('ask') || label.includes('질문') || label.includes('물어')) return true;
      if (placeholder.includes('ask') || placeholder.includes('search') || placeholder.includes('질문') || placeholder.includes('물어')) return true;
    }
    // 구버전: textarea
    if (target instanceof HTMLTextAreaElement) {
      const placeholder = (target.placeholder ?? '').toLowerCase();
      if (placeholder.includes('ask') || placeholder.includes('search') || placeholder.includes('질문') || placeholder.includes('물어')) {
        return true;
      }
      const form = target.closest('form');
      if (form && form.querySelectorAll('textarea').length === 1) return true;
    }
    return false;
  },
});
