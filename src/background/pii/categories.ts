import type { MaskMode, PIICategory } from '@/shared/types';

export interface CategoryDefinition {
  id: PIICategory;
  labelKo: string;
  labelEn: string;
  defaultEnabled: boolean;
  defaultMaskMode: MaskMode;
  sources: ReadonlyArray<'regex' | 'model' | 'korean_ner'>;
  /** UI에서 노출할 마스킹 모드. 미지정 시 DEFAULT_MODES (shape, tag, fake, remove). */
  allowedModes?: ReadonlyArray<MaskMode>;
}

export const DEFAULT_MODES: ReadonlyArray<MaskMode> = ['shape', 'tag', 'fake', 'remove'];

export const CATEGORIES: Record<PIICategory, CategoryDefinition> = {
  rrn: {
    id: 'rrn',
    labelKo: '주민등록번호',
    labelEn: 'Resident Registration Number',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  foreign_registration: {
    id: 'foreign_registration',
    labelKo: '외국인등록번호',
    labelEn: 'Foreigner Registration Number',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  mobile: {
    id: 'mobile',
    labelKo: '휴대폰 번호',
    labelEn: 'Mobile Phone',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex', 'model'],
  },
  landline: {
    id: 'landline',
    labelKo: '유선전화',
    labelEn: 'Landline',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex', 'model'],
  },
  account: {
    id: 'account',
    labelKo: '계좌번호',
    labelEn: 'Bank Account',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex', 'model'],
  },
  card: {
    id: 'card',
    labelKo: '카드번호',
    labelEn: 'Card Number',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  business_number: {
    id: 'business_number',
    labelKo: '사업자등록번호',
    labelEn: 'Business Registration Number',
    defaultEnabled: false,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  corporate_registration: {
    id: 'corporate_registration',
    labelKo: '법인등록번호',
    labelEn: 'Corporate Registration Number',
    defaultEnabled: false,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  driver_license: {
    id: 'driver_license',
    labelKo: '운전면허번호',
    labelEn: 'Driver License Number',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  person_name: {
    id: 'person_name',
    labelKo: '사람 이름',
    labelEn: 'Person Name',
    defaultEnabled: true,
    defaultMaskMode: 'fake',
    sources: ['model', 'korean_ner', 'regex'],
    allowedModes: ['shape', 'partial', 'tag', 'fake', 'remove'],
  },
  email: {
    id: 'email',
    labelKo: '이메일',
    labelEn: 'Email',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex', 'model'],
  },
  address: {
    id: 'address',
    labelKo: '주소',
    labelEn: 'Address',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['model', 'regex'],
  },
  postal_code: {
    id: 'postal_code',
    labelKo: '우편번호',
    labelEn: 'Postal Code',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
  url: {
    id: 'url',
    labelKo: 'URL',
    labelEn: 'URL',
    defaultEnabled: false,
    defaultMaskMode: 'tag',
    sources: ['model'],
  },
  date: {
    id: 'date',
    labelKo: '날짜',
    labelEn: 'Date',
    // v1.4: 정규식(YYYY[.-/]M[.-/]D + 한국어) 추가 → default ON. 생년월일이 PII로 흔함.
    // false positive(버전 번호 등)는 prefix 차단 + 사용자 토글로 흡수.
    defaultEnabled: true,
    defaultMaskMode: 'tag',
    sources: ['regex', 'model'],
  },
  credential: {
    id: 'credential',
    labelKo: '비밀번호·인증키 (API 키·토큰)',
    labelEn: 'Credentials (API Keys, Tokens, Passwords)',
    defaultEnabled: true,
    defaultMaskMode: 'remove',
    sources: ['regex', 'model'],
  },
  organization: {
    id: 'organization',
    labelKo: '조직명',
    labelEn: 'Organization',
    defaultEnabled: false,
    defaultMaskMode: 'tag',
    sources: ['korean_ner', 'model'],
  },
  passport: {
    id: 'passport',
    labelKo: '여권번호',
    labelEn: 'Passport Number',
    defaultEnabled: true,
    defaultMaskMode: 'shape',
    sources: ['regex'],
  },
};

// UI 표시 순서 — 사용자가 자주 보는/이해하기 쉬운 항목 우선.
export const CATEGORY_ORDER: ReadonlyArray<PIICategory> = [
  'person_name',
  'rrn',
  'foreign_registration',
  'driver_license',
  'passport',
  'mobile',
  'landline',
  'email',
  'address',
  'postal_code',
  'card',
  'account',
  'business_number',
  'corporate_registration',
  'organization',
  'url',
  'date',
  'credential',
];
