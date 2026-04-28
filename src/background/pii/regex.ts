import type { PIICategory, PIISpan } from '@/shared/types';

// =============================================================================
// Checksum validators
// =============================================================================

const RRN_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validateRRNDateSemantic(digits: string): boolean {
  // YYMMDD 자릿수의 월(1-12)과 일(1-31, 월별 일수)이 합리적인지
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]!) return false;
  return true;
}

export function validateRRNChecksum(digits: string): boolean {
  if (digits.length !== 13) return false;
  if (!/^\d{13}$/.test(digits)) return false;
  if (!validateRRNDateSemantic(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * RRN_WEIGHTS[i]!;
  }
  const expected = (11 - (sum % 11)) % 10;
  return expected === Number(digits[12]);
}

export function validateForeignerRegistrationChecksum(digits: string): boolean {
  if (digits.length !== 13) return false;
  if (!/^\d{13}$/.test(digits)) return false;
  if (!validateRRNDateSemantic(digits)) return false;
  // 외국인등록번호는 7번째 자리(인덱스 6)가 5,6,7,8 — 9는 거의 미사용
  const seventh = Number(digits[6]);
  if (seventh < 5 || seventh > 8) return false;
  // 검증식은 RRN과 동일 가중치, 단 +2 보정 후 11 모듈로
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * RRN_WEIGHTS[i]!;
  }
  let expected = (11 - (sum % 11)) % 10;
  expected = (expected + 2) % 10;
  return expected === Number(digits[12]);
}

const BIZ_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function validateBusinessNumberChecksum(digits: string): boolean {
  if (digits.length !== 10) return false;
  if (!/^\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * BIZ_WEIGHTS[i]!;
  }
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(digits[9]);
}

export function validateLuhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length < 13 || digits.length > 19) return false;
  // 모두 0인 카드는 수학적으로 Luhn을 통과하지만 발급 불가 — 거절
  if (/^0+$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// =============================================================================
// Patterns
// =============================================================================

const RRN_PATTERN = /\b(\d{6})[-\s]?([1-4]\d{6})\b/g;
const FOREIGNER_PATTERN = /\b(\d{6})[-\s]?([5-8]\d{6})\b/g;
const BIZ_PATTERN = /\b(\d{3})[-\s]?(\d{2})[-\s]?(\d{5})\b/g;

// 휴대폰: 010-XXXX-XXXX (4자리), 011/016/017/018/019 + 3 또는 4자리
const MOBILE_PATTERN = /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g;

// 유선전화: 지역번호(02, 031~064, 070, 0505/0506/0507) + 자릿수
const LANDLINE_PATTERN =
  /\b(?:02|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])|070|050[5-7])[-\s]\d{3,4}[-\s]\d{4}\b/g;

// 계좌번호: 한국 주요 은행 자릿수 패턴 화이트리스트
const ACCOUNT_PATTERNS = [
  /\b\d{3}-\d{2}-\d{6}\b/g, // 농협/우체국 11자리
  /\b\d{3}-\d{3}-\d{6}\b/g, // 신한 12자리
  /\b\d{3}-\d{6}-\d{2}-\d{3}\b/g, // KB 14자리
  /\b\d{4}-\d{3}-\d{6}\b/g, // 13자리 변형
  /\b\d{4}-\d{2}-\d{6}\b/g, // 12자리 변형
  /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, // 우리/하나 등 16자리 (단, 카드와 충돌 — Luhn으로 분리)
];

const CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

const EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// 한국 여권: M(전자여권) 또는 R(구여권) + 8자리 숫자
// ICAO 9303 기준. 일부 구버전은 알파벳+8자리
const PASSPORT_KR_PATTERN = /\b[MRSO]\d{8}\b/g;

// 미국 SSN: AAA-GG-SSSS, 단 0/666/9XX prefix는 미발급 → 제외
const SSN_US_PATTERN = /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;

// 국제 전화 (E.164): +국가코드 + 숫자 (4-14자리), 공백/하이픈 허용
const INTL_PHONE_PATTERN = /(?:^|[^\w+])\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{2,4}[\s-]?\d{2,4}(?:[\s-]?\d{2,4})?\b/g;

// 자격정보 prefix-based
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI/Anthropic
  /\b(?:xoxb|xoxp|xoxs|xoxa)-[A-Za-z0-9-]{16,}\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temp credentials
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, // GitHub PAT/OAuth
  /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)(?:\+[a-z]+)?:\/\/[^\s:@]+:[^\s@]+@[^\s/]+/gi,
];

// 한국 성씨 (top 50, 인구 기준 상위)
const KOREAN_SURNAMES = [
  '김','이','박','최','정','강','조','윤','장','임',
  '한','오','서','신','권','황','안','송','류','전',
  '홍','고','문','양','손','배','백','허','유','남',
  '심','노','하','곽','성','차','주','우','구','민',
  '진','지','연','함','변','염','여','추','도','소',
];

const SURNAME_CLASS = `[${KOREAN_SURNAMES.join('')}]`;
// 성+1~2자 이름 + (선택적) 존칭/직책.
// JS 정규식의 \b는 \w(ASCII) 기준이라 한글에서 동작 안 함 → lookbehind/lookahead 사용.
// 길이 desc 정렬 — alternation에서 긴 것 우선 매치 (예: "팀장님" > "팀장")
const TITLES = [
  '사무국장','이사장님','대표님','부장님','과장님','팀장님','회장님','사장님',
  '이사님','선생님','박사님','이사장','본부장','센터장','대표','부장','과장',
  '팀장','회장','사장','이사','국장','선생','박사','님','씨',
];
const TITLE_PATTERN = TITLES.join('|');
// "팀장님" 다음에 조사("께","이","은")가 한글로 붙는 게 흔하므로 trailing boundary 제외.
const NAME_WITH_TITLE = new RegExp(
  `(?<![가-힣])${SURNAME_CLASS}[가-힣]{1,2}(?=\\s?(?:${TITLE_PATTERN}))`,
  'g',
);
// 존칭 없이도 매칭하지만 confidence 낮음. 한국 이름은 거의 모두 3자(성+2자) — 2자 매칭은
// FP가 압도적(이사/주요/성명/관련/소속 등)이라 3자로 제한.
const NAME_BARE = new RegExp(
  `(?<![가-힣])${SURNAME_CLASS}[가-힣]{2}(?![가-힣])`,
  'g',
);

// 3자 매칭 중에도 흔한 일반명사/어미는 stoplist로 차단. 주기적으로 갱신 필요.
const NAME_BARE_STOPLIST: ReadonlySet<string> = new Set([
  // -시기/-니다 같은 동사 어미
  '주시기', '주신분', '주신다', '주시는', '주십시', '주시고', '주실수', '주는데',
  // 자주 쓰이는 명사
  '구성원', '이사장', '이사진', '이사회', '이사들', '이사진', '강조점', '강의안',
  '강의록', '강의실', '강사진', '강의실', '강의를', '강조한', '강조함',
  '소속의', '소속을', '소속이', '소속된',
  '한국의', '한국을', '한국이', '한국인', '한국에', '한국어', '한국적', '한국형',
  '정부의', '정부를', '정부에', '정부가', '정부와', '정부도', '정부는', '정부측',
  '정도의', '정도를', '정도로', '정도면', '정도가', '정도는',
  '조사의', '조사를', '조사가', '조사로', '조사한', '조사된', '조선시',
  '변경의', '변경을', '변경된', '변경된', '변동의', '변동을', '변동이',
  '오늘의', '오늘은', '오늘도', '오늘만',
  '서울의', '서울을', '서울에', '서울이', '서울시', '서울대',
  '신청서', '신청을', '신청한', '신청자', '신청이',
  '심의의', '심의를', '심의가', '심의한', '심의된',
  '여러분', '여러개', '여러건', '여러번', '여러명',
  '연구의', '연구를', '연구가', '연구한', '연구원', '연구진', '연구실',
  '연락처', '연결된', '연결을', '연합회',
  '윤리적', '윤리를', '윤리의', '장관의', '장관을', '장관이',
  '장려금', '장려를', '장단점',
  '문의의', '문의를', '문의가', '문제는', '문제를', '문제의', '문서를',
  '도움의', '도움을', '도움이', '도움말', '도움도',
  '백서의', '백서를', '백서가', '백분율',
]);

// =============================================================================
// Detectors
// =============================================================================

interface RawMatch {
  start: number;
  end: number;
  text: string;
  category: PIICategory;
  confidence: number;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function detectRRN(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(RRN_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    if (validateRRNChecksum(digits)) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'rrn',
        confidence: 0.99,
      });
    }
  }
  return out;
}

function detectForeignerRegistration(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(FOREIGNER_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    if (validateForeignerRegistrationChecksum(digits)) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'foreign_registration',
        confidence: 0.97,
      });
    }
  }
  return out;
}

function detectBusinessNumber(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(BIZ_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    if (validateBusinessNumberChecksum(digits)) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'business_number',
        confidence: 0.95,
      });
    }
  }
  return out;
}

function detectMobile(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(MOBILE_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    // 11자리(010+8) 또는 12자리(011+8) 까지 허용
    if (digits.length < 10 || digits.length > 11) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'mobile',
      confidence: 0.95,
    });
  }
  return out;
}

function detectLandline(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(LANDLINE_PATTERN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'landline',
      confidence: 0.85,
    });
  }
  return out;
}

function detectAccount(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const pattern of ACCOUNT_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      if (m.index === undefined) continue;
      const digits = digitsOnly(m[0]);
      // 16자리 + Luhn 통과면 카드로 분류 (이쪽에선 제외)
      if (digits.length === 16 && validateLuhn(digits)) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'account',
        confidence: 0.7,
      });
    }
  }
  return out;
}

function detectCard(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(CARD_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    if (digits.length === 16 && validateLuhn(digits)) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'card',
        confidence: 0.95,
      });
    }
  }
  return out;
}

function detectEmail(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(EMAIL_PATTERN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'email',
      confidence: 0.95,
    });
  }
  return out;
}

function detectCredential(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const pattern of CREDENTIAL_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      if (m.index === undefined) continue;
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        category: 'credential',
        confidence: 0.95,
      });
    }
  }
  return out;
}

function detectPassport(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(PASSPORT_KR_PATTERN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'passport',
      confidence: 0.85,
    });
  }
  return out;
}

function detectSSNUS(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(SSN_US_PATTERN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'ssn_us',
      confidence: 0.9,
    });
  }
  return out;
}

function detectInternationalPhone(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(INTL_PHONE_PATTERN)) {
    if (m.index === undefined) continue;
    // 매치된 전체에서 leading 비단어/공백을 제거하고 +로 시작하는 부분만 추출
    const plusIdx = m[0].indexOf('+');
    if (plusIdx < 0) continue;
    const start = m.index + plusIdx;
    const matched = m[0].slice(plusIdx);
    const digits = digitsOnly(matched);
    if (digits.length < 7 || digits.length > 15) continue;
    out.push({
      start,
      end: start + matched.length,
      text: matched,
      category: 'phone_international',
      confidence: 0.8,
    });
  }
  return out;
}

function detectKoreanName(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  // 직책/존칭 동반 — 높은 confidence
  for (const m of text.matchAll(NAME_WITH_TITLE)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.85,
    });
  }
  // bare 이름 — 3자만, stoplist 적용, 조사 어미 차단.
  for (const m of text.matchAll(NAME_BARE)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_BARE_STOPLIST.has(matched)) continue;
    // 마지막 글자가 명백한 조사면 단어+조사 — name 아님
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의도만에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.4,
    });
  }
  return out;
}

// =============================================================================
// Merge / dedupe
// =============================================================================

/**
 * 겹치는 스팬 제거. 우선순위:
 * 1. 더 긴 스팬 우선
 * 2. 동률이면 confidence 높은 것 우선
 * 3. 동률이면 카테고리 우선순위 (rrn > credential > card > account > ...)
 */
const CATEGORY_PRIORITY: Record<PIICategory, number> = {
  rrn: 100,
  foreign_registration: 99,
  passport: 97,
  ssn_us: 96,
  credential: 95,
  card: 90,
  business_number: 85,
  account: 80,
  mobile: 70,
  landline: 65,
  phone_international: 67,
  email: 60,
  person_name: 50,
  address: 40,
  organization: 30,
  url: 20,
  date: 10,
};

function spansOverlap(a: RawMatch, b: RawMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

function dedupe(matches: RawMatch[]): RawMatch[] {
  const sorted = [...matches].sort((a, b) => {
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
  });
  const kept: RawMatch[] = [];
  for (const m of sorted) {
    if (kept.some((k) => spansOverlap(k, m))) continue;
    kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// =============================================================================
// Public entry
// =============================================================================

export function detectKoreanPII(text: string): PIISpan[] {
  const raw: RawMatch[] = [
    ...detectRRN(text),
    ...detectForeignerRegistration(text),
    ...detectPassport(text),
    ...detectSSNUS(text),
    ...detectBusinessNumber(text),
    ...detectCard(text),
    ...detectAccount(text),
    ...detectMobile(text),
    ...detectLandline(text),
    ...detectInternationalPhone(text),
    ...detectEmail(text),
    ...detectCredential(text),
    ...detectKoreanName(text),
  ];
  return dedupe(raw).map((m) => ({
    start: m.start,
    end: m.end,
    text: m.text,
    category: m.category,
    confidence: m.confidence,
    source: 'regex' as const,
  }));
}
