// Gemini 어댑터 — gemini.google.com. Quill 기반 contenteditable (`.ql-editor`).
// rich-textarea 커스텀 요소 내부에 contenteditable이 있음.
import { createPasteAdapter } from './factory';

export const geminiAdapter = createPasteAdapter({
  id: 'gemini',
  hosts: ['gemini.google.com'],
  isInput(target) {
    // Quill 에디터
    if (target.closest('.ql-editor')) return true;
    // rich-textarea 안의 contenteditable
    const editable = target.closest('[contenteditable="true"]');
    if (editable instanceof HTMLElement && editable.closest('rich-textarea, [role="textbox"]')) return true;
    return false;
  },
});
