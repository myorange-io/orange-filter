// Claude 어댑터 — claude.ai. ProseMirror contenteditable.
// 입력 요소: `<div contenteditable="true">` (data-placeholder, ProseMirror 클래스).
// fieldset 또는 form 내부에 있음.
import { createPasteAdapter } from './factory';

export const claudeAdapter = createPasteAdapter({
  id: 'claude',
  hosts: ['claude.ai'],
  isInput(target) {
    const editable = target.closest('[contenteditable="true"]');
    if (!(editable instanceof HTMLElement)) return false;
    // 채팅 입력은 fieldset 또는 form 내부에 있음 (사이드바 검색 등 다른 contenteditable 제외)
    if (!editable.closest('fieldset, form, [role="textbox"]')) return false;
    return true;
  },
});
