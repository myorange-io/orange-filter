// Perplexity 어댑터 — perplexity.ai / www.perplexity.ai.
// 입력 요소: `<textarea>` (메인 검색바). rich editor가 아님.
import { createPasteAdapter } from './factory';

export const perplexityAdapter = createPasteAdapter({
  id: 'perplexity',
  hosts: ['perplexity.ai'],
  isInput(target) {
    if (!(target instanceof HTMLTextAreaElement)) return false;
    // 메인 입력란은 폼/검색 영역 안의 textarea. 페이지 다른 textarea(피드백 등) 제외.
    const placeholder = (target.placeholder ?? '').toLowerCase();
    if (placeholder.includes('ask') || placeholder.includes('search') || placeholder.includes('질문') || placeholder.includes('물어')) {
      return true;
    }
    // form 내부의 단일 textarea도 채팅 입력으로 간주
    const form = target.closest('form');
    if (form && form.querySelectorAll('textarea').length === 1) return true;
    return false;
  },
});
