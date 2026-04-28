// 파일 파서 / 익스포터 공통 형식.
// 각 segment는 PII 탐지 단위. 파일 내 위치(시트+셀, 페이지+라인 등)를 id로 보존.

import type { PIICategory } from '@/shared/types';

export interface Segment {
  /** 위치 식별자 — 동일 파일 내 unique. exporter가 이 id로 다시 찾아 채움. */
  id: string;
  /** segment의 원본 텍스트 */
  text: string;
  /**
   * 표 헤더로 추정되는 행에 속한 segment — 마스킹 제외.
   * 예: xlsx의 "성명|연락처|이메일" 헤더 셀 자체는 PII가 아님.
   */
  isHeader?: boolean;
  /**
   * 헤더가 가리키는 카테고리. 셋되면 detect 결과와 무관하게
   * segment 텍스트 전체가 해당 카테고리 PII로 강제 마스킹된다.
   * (예: "성명" 컬럼의 모든 데이터 셀 → person_name)
   */
  forcedCategory?: PIICategory;
}

export interface ParseResult {
  segments: Segment[];
  /** UI 미리보기 / 통계용 평탄화 텍스트 */
  combinedText: string;
}

export type ExportInput = ReadonlyMap<string, string>;
