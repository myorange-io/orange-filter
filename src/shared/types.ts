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
  | 'url'
  | 'date'
  | 'credential'
  | 'organization';

export type MaskMode = 'shape' | 'tag' | 'fake' | 'remove';

export type DetectionSource = 'regex' | 'model' | 'korean_ner';

export interface PIISpan {
  start: number;
  end: number;
  text: string;
  category: PIICategory;
  confidence: number;
  source: DetectionSource;
}

export interface DetectResult {
  spans: PIISpan[];
  textLength: number;
}
