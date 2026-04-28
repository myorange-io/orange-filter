// 사이트 어댑터 공통 — paste 가로채기 후 마스킹된 텍스트를 입력 요소에 주입.
// execCommand('insertText')는 deprecated이지만 contenteditable + ProseMirror/Quill 시나리오에서
// input 이벤트를 가장 안정적으로 트리거. textarea fallback은 native value setter 우회.

export function insertIntoElement(target: HTMLElement, text: string): void {
  target.focus();
  const ok = document.execCommand('insertText', false, text);
  if (ok) return;

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const proto = target instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const next = target.value.slice(0, start) + text + target.value.slice(end);
    setter?.call(target, next);
    const cursor = start + text.length;
    target.setSelectionRange(cursor, cursor);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // contenteditable fallback — textContent 직접 추가 후 input 이벤트
  target.textContent = (target.textContent ?? '') + text;
  target.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
}
