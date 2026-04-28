// ChatGPT 어댑터 — chat.openai.com / chatgpt.com.
// 신버전: ProseMirror contenteditable. 구버전: #prompt-textarea (textarea).
import { createPasteAdapter } from './factory';

export const chatgptAdapter = createPasteAdapter({
  id: 'chatgpt',
  hosts: ['chat.openai.com', 'chatgpt.com'],
  isInput(target) {
    const editable = target.closest('[contenteditable="true"]');
    if (editable instanceof HTMLElement && editable.closest('form, [role="textbox"]')) return true;
    if (target.matches('[contenteditable="true"]')) return true;
    if (target instanceof HTMLTextAreaElement && target.id === 'prompt-textarea') return true;
    return false;
  },
});
