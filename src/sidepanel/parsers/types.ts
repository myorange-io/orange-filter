// 파일 파서 / 익스포터 공통 형식.
// 각 segment는 PII 탐지 단위. 파일 내 위치(시트+셀, 페이지+라인 등)를 id로 보존.

export interface Segment {
  /** 위치 식별자 — 동일 파일 내 unique. exporter가 이 id로 다시 찾아 채움. */
  id: string;
  /** segment의 원본 텍스트 */
  text: string;
}

export interface ParseResult {
  segments: Segment[];
  /** UI 미리보기 / 통계용 평탄화 텍스트 */
  combinedText: string;
}

export type ExportInput = ReadonlyMap<string, string>;
