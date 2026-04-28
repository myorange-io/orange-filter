// LLM 사이트 어댑터 공통 인터페이스.
// 각 어댑터는 paste(또는 submit) 시점을 가로채 PII 검사 후 값을 주입한다.

export interface PasteContext {
  /** 원본 paste 텍스트 */
  text: string;
  /** 사용자가 모달에서 "그대로 붙여넣기" 선택 시 호출 — 원본을 입력 요소에 삽입 */
  proceedAsIs(): void;
  /** 마스킹된 텍스트로 대체해 입력 요소에 삽입 */
  replaceWith(masked: string): void;
  /** paste 취소 — 아무것도 삽입하지 않음 */
  cancel(): void;
}

export interface SiteAdapter {
  /** 디버그/로깅용 식별자 */
  id: string;
  /** 현재 hostname에 적용 가능한지 */
  matches(hostname: string): boolean;
  /** content script 진입 시 호출. paste 이벤트 후킹을 설치. uninstaller 반환. */
  install(onPaste: (ctx: PasteContext) => void): () => void;
}
