export type PIICategory =
  | 'rrn'
  | 'foreign_registration'
  | 'driver_license'
  | 'mobile'
  | 'landline'
  | 'account'
  | 'card'
  | 'business_number'
  | 'corporate_registration'
  | 'passport'
  | 'person_name'
  | 'email'
  | 'address'
  | 'postal_code'
  | 'url'
  | 'date'
  | 'credential'
  | 'organization';

export type MaskMode = 'shape' | 'tag' | 'fake' | 'remove' | 'partial';

export type DetectionSource = 'regex' | 'model' | 'korean_ner';

export interface PIISpan {
  start: number;
  end: number;
  text: string;
  category: PIICategory;
  confidence: number;
  source: DetectionSource;
  /**
   * 동음이의어 후보(예: '이미지', '미지')로 regex가 NAME_BARE 매치한 경우 true.
   * mergeSpans 단계에서 NER이 같은 위치를 person_name으로 confirm 해야 채택되며,
   * 미확정 시 drop. 최종 결과에는 노출되지 않는다(merge에서 제거).
   * 호칭/직책 컨텍스트(NAME_WITH_TITLE)는 영향받지 않음.
   */
  tentative?: boolean;
}

export interface DetectResult {
  spans: PIISpan[];
  textLength: number;
}
