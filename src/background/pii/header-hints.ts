// 표 헤더(컬럼명) 또는 인라인 라벨("성명:", "연락처:") 텍스트 → PII 카테고리 매핑.
// xlsx/csv 파서는 시트 헤더 행을 감지해 컬럼별 forcedCategory를 부여하고,
// 비표 포맷(docx/pdf/hwp/txt)은 detector가 "라벨: 값" 패턴을 보고 값에 카테고리를 부스트한다.

import type { PIICategory } from '@/shared/types';

/** 정규화: 공백·콜론·괄호·슬래시 제거 + 소문자. "E-mail" / "이 메일" / "메일/Email" 모두 같은 키로. */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s:：()\[\]/·,.\-_]/g, '');
}

// 한국어 + 영문 헤더/라벨 사전. 정규화 후 비교.
// 원칙: 자주 쓰이는 변형까지 포괄하되, 너무 일반적인 단어("정보", "값")는 제외.
const HEADER_KEYWORDS: Record<PIICategory, ReadonlyArray<string>> = {
  person_name: [
    '성명', '이름', '성함', '담당자', '대표자', '대표', '연구자', '참석자',
    '신청자', '응답자', '회원명', '고객명', '사용자명', '학생명', '환자명',
    'name', 'fullname',
  ],
  mobile: [
    '휴대폰', '휴대폰번호', '핸드폰', '핸드폰번호', '모바일', '모바일번호',
    // "연락처"는 실 NPO 양식에서 거의 항상 010-* 휴대폰 → mobile로 매핑.
    '연락처', '연락',
    'hp', 'h.p.', 'cellphone', 'mobile', 'mobilephone',
  ],
  landline: [
    '전화', '전화번호', '유선전화', '사무실전화', '회사전화', '집전화',
    'tel', 'telephone', 'phone', 'landline',
  ],
  email: [
    '이메일', '메일', 'e메일', 'email', 'e-mail', 'mail', 'mailaddress', '이메일주소',
  ],
  account: [
    '계좌', '계좌번호', '계좌정보', '입금계좌', '환급계좌', '은행계좌', '예금주계좌',
    'account', 'accountnumber', 'bankaccount',
  ],
  address: [
    '주소', '거주지', '거주지주소', '자택주소', '회사주소', '집주소', '현주소',
    'address', 'addr',
  ],
  postal_code: [
    '우편번호', '우편', 'zip', 'zipcode', 'postalcode', 'postcode',
  ],
  rrn: [
    '주민번호', '주민등록번호', 'rrn', 'residentregistrationnumber',
  ],
  business_number: [
    '사업자번호', '사업자등록번호', 'businessnumber', 'businessregistrationnumber',
  ],
  corporate_registration: [
    '법인번호', '법인등록번호', 'corporateregistrationnumber',
  ],
  passport: [
    '여권', '여권번호', 'passport', 'passportnumber',
  ],
  driver_license: [
    '면허', '면허번호', '운전면허', '운전면허번호', 'driverlicense', 'driverlicensenumber',
  ],
  card: [
    '카드', '카드번호', '신용카드', '신용카드번호', 'card', 'cardnumber', 'creditcard',
  ],
  organization: [
    '소속', '기관', '기관명', '회사', '회사명', '단체', '단체명', '학교', '대학교', '학과',
    'organization', 'company', 'institution', 'affiliation',
  ],
  foreign_registration: [
    '외국인등록번호', '외국인번호', 'foreignregistrationnumber',
  ],
  url: [
    'url', 'website', '웹사이트', '홈페이지',
  ],
  date: [
    '생년월일', '생일', '출생일', '출생연월일', 'dateofbirth', 'birthdate', 'dob',
  ],
  credential: [
    '비밀번호', '암호', '패스워드', 'password', 'passwd', 'apikey', 'api키', '토큰', 'token',
  ],
};

// 역방향 lookup 테이블 (정규화된 키워드 → category).
const KEYWORD_TO_CATEGORY: Map<string, PIICategory> = (() => {
  const m = new Map<string, PIICategory>();
  for (const [cat, words] of Object.entries(HEADER_KEYWORDS) as Array<
    [PIICategory, ReadonlyArray<string>]
  >) {
    for (const w of words) {
      const k = normalizeHeader(w);
      if (k.length > 0) m.set(k, cat);
    }
  }
  return m;
})();

/** 헤더 셀 텍스트가 사전과 매치되면 카테고리 반환. 미매치면 undefined. */
export function categoryForHeader(headerText: string): PIICategory | undefined {
  if (!headerText) return undefined;
  const k = normalizeHeader(headerText);
  if (k.length === 0) return undefined;
  return KEYWORD_TO_CATEGORY.get(k);
}

// =============================================================================
// 이름 힌트 헤더 — 셀 전체가 이름은 아니지만 첨부 파일명 등에 이름이 포함될
// 가능성이 높은 컬럼. forcedCategory가 아닌 nameHintOnly로 표시되어
// 컨텍스트 제한 2자 이름 매칭이 추가로 활성화된다.
// =============================================================================
const NAME_HINT_HEADER_KEYWORDS: ReadonlyArray<string> = [
  '신분증', '신분증사본', '주민등록증사본', '주민증사본', '면허증사본',
  '통장', '통장사본', '계좌사본',
  '이력서', '이력', '경력서', '경력', '약력',
  '면허', '면허증', '운전면허',
  '여권사본',
  'cv', 'resume',
];
const NAME_HINT_HEADER_SET: ReadonlySet<string> = new Set(
  NAME_HINT_HEADER_KEYWORDS.map((s) => normalizeHeader(s)).filter((s) => s.length > 0),
);

/** 헤더가 "이름 힌트" 컬럼이면 true (예: 신분증/통장사본/이력서). */
export function isNameHintHeader(headerText: string): boolean {
  const k = normalizeHeader(headerText);
  return k.length > 0 && NAME_HINT_HEADER_SET.has(k);
}

/**
 * 시트의 처음 N행 중 "헤더 행"으로 가장 적합한 행 인덱스 반환.
 * 휴리스틱: forcedCategory + nameHint 합산 매치 셀이 가장 많은 행.
 * 매치 0건이면 undefined.
 *
 * `rows`는 시트의 처음 몇 행(원본 텍스트 그대로). 빈 셀은 빈 문자열.
 */
export function detectHeaderRow(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  scanLimit = 5,
):
  | {
      rowIndex: number;
      categoryByCol: Map<number, PIICategory>;
      nameHintCols: Set<number>;
    }
  | undefined {
  let best:
    | {
        rowIndex: number;
        categoryByCol: Map<number, PIICategory>;
        nameHintCols: Set<number>;
      }
    | undefined;
  const limit = Math.min(scanLimit, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const map = new Map<number, PIICategory>();
    const hints = new Set<number>();
    for (let c = 0; c < row.length; c++) {
      const cell = row[c] ?? '';
      const cat = categoryForHeader(cell);
      if (cat) map.set(c, cat);
      else if (isNameHintHeader(cell)) hints.add(c);
    }
    const score = map.size + hints.size;
    if (score === 0) continue;
    const bestScore = best ? best.categoryByCol.size + best.nameHintCols.size : 0;
    if (score > bestScore) {
      best = { rowIndex: r, categoryByCol: map, nameHintCols: hints };
    }
  }
  return best;
}

// =============================================================================
// 인라인 라벨(cue) 패턴: "성명: 조성도", "여권번호 M12345678", "이메일=foo@bar"
// 표 구조 없이 한 줄 또는 한 단락에 라벨/값이 같이 있는 경우.
//
// 2티어 cue 구조 — LiquidAI PII-Detector의 `context_cued.py` 설계를 참고했다.
// 그쪽 문제 정의가 우리와 같다: 여권·면허·계좌처럼 **형태가 임의인 ID**는 학습 가능한
// shape가 없어 NER recall이 사실상 0이지만, 실제 문서에서는 거의 항상 필드 라벨 뒤에 온다.
// 라벨이 매치를 게이트하므로 정밀도가 높다.
//
//   Tier A — 명시 구분자(`:` `：` `＝` `=` `#` `№`). 사전의 모든 카테고리 허용.
//            값은 다음 cue 직전 또는 줄바꿈/탭/`|`까지.
//   Tier B — 공백만으로 구분("여권번호 M12345678"). 오탐 위험이 커서 두 겹으로 조인다:
//            (1) 카테고리를 임의 형식 ID 계열로 한정(ID_CUE_CATEGORIES),
//            (2) 값이 영숫자로 시작하고 숫자를 포함해야 채택.
//            덕분에 "카드 3장"·"면허 2급"·"주소 서울시"는 걸리지 않는다.
// =============================================================================

/**
 * Tier B(공백 구분자)에서만 허용하는 카테고리 — 임의 형식 ID.
 *
 * 이 목록에 person_name·address·organization을 넣지 않는 것이 핵심이다. 그쪽은
 * 값이 자연어라 공백 구분자만으로는 "라벨 + 값"과 평범한 문장을 구분할 수 없다
 * ("대표 김철수가 말하길…"). 명시 구분자가 있는 Tier A에서만 다룬다.
 */
const ID_CUE_CATEGORIES: ReadonlySet<PIICategory> = new Set<PIICategory>([
  'rrn',
  'foreign_registration',
  'passport',
  'driver_license',
  'business_number',
  'corporate_registration',
  'account',
  'card',
  'credential',
]);

// 라벨 후보 문자 — 한글/영문/일부 기호. 숫자는 값과 구분하기 위해 제외.
// Tier A는 다어절 영문 라벨("Account Number:")을 위해 공백을 포함하고,
// Tier B는 공백이 구분자 역할을 하므로 제외한다.
const LABEL_A_RE = /([가-힣A-Za-z·.\-_/ ]{1,16})[ \t]*[::＝=#№][ \t]*/g;
const LABEL_B_RE = /([가-힣A-Za-z·.\-_/]{2,16})[ \t]+(?=[A-Za-z0-9])/g;

// Tier B 값의 형태 — 영숫자로 시작·끝나고 내부에 공백/하이픈/점/슬래시 허용.
// 한글을 포함하지 않으므로 "M12345678 발급" → "M12345678"에서 정확히 끊긴다.
const ID_VALUE_RE = /^[A-Za-z0-9][A-Za-z0-9 .\-/]*[A-Za-z0-9]/;
// credential은 숫자 없이도 성립("암호 hunterpass") → 공백 없는 단일 토큰으로 한정.
const CRED_VALUE_RE = /^\S{4,64}/;

/** 값 영역을 끊는 구조 문자 — 줄바꿈/탭/셀 구분자. */
function isValueBreak(ch: string): boolean {
  return ch === '\n' || ch === '\r' || ch === '\t' || ch === '|';
}

/**
 * 캡처된 라벨 후보에서 사전과 매치되는 **가장 긴 접미사**를 찾는다.
 *
 * 라벨 캡처가 앞선 값을 삼키는 문제를 보정한다. "성명: 김민수 연락처: 010-…"의 두 번째
 * 캡처는 greedy 매칭 탓에 "김민수 연락처"가 되는데, 사전에는 없으므로 예전 구현은 이
 * 라벨을 통째로 놓쳤다(= 한 줄에 라벨이 여러 개면 두 번째부터 미검출). 접미사를 긴
 * 것부터 훑으면 "연락처"에서 매치된다.
 */
function resolveLabelSuffix(
  raw: string,
): { label: string; offset: number; category: PIICategory } | undefined {
  const trimmed = raw.replace(/\s+$/, '');
  if (trimmed.length === 0) return undefined;
  // 후보 시작 위치: 0(전체) + 각 공백 직후. 앞쪽부터 = 긴 접미사부터.
  const starts: number[] = [0];
  for (let i = 0; i < trimmed.length - 1; i++) {
    if (/\s/.test(trimmed[i]!) && !/\s/.test(trimmed[i + 1]!)) starts.push(i + 1);
  }
  for (const s of starts) {
    const cand = trimmed.slice(s);
    const cat = categoryForHeader(cand);
    if (cat) return { label: cand, offset: s, category: cat };
  }
  return undefined;
}

/** 사전 미매치 캡처에서 라벨로 추정되는 마지막 어절의 시작 offset. */
function lastTokenOffset(raw: string): number {
  const trimmed = raw.replace(/\s+$/, '');
  const idx = trimmed.search(/\S+$/);
  return idx < 0 ? 0 : idx;
}

interface Cue {
  /** 라벨이 시작하는 위치 (앞 값의 경계로 쓰인다) */
  cueStart: number;
  /** 값이 시작하는 위치 */
  valueStart: number;
  /** 사전 매치 결과. 미매치면 undefined — 경계 역할만 한다. */
  resolved?: { label: string; category: PIICategory };
  tier: 'A' | 'B';
}

/** 한 정규식으로 cue 목록 수집. 사전 미매치 cue도 경계 계산을 위해 담는다. */
function collectCues(text: string, re: RegExp, tier: 'A' | 'B'): Cue[] {
  const out: Cue[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? '';
    const valueStart = m.index + m[0].length;
    const hit = resolveLabelSuffix(raw);
    out.push({
      cueStart: m.index + (hit ? hit.offset : lastTokenOffset(raw)),
      valueStart,
      resolved: hit ? { label: hit.label, category: hit.category } : undefined,
      tier,
    });
    // 빈 매치 방어 (Tier B의 lookahead는 폭이 0인 구간을 만들 수 있다)
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

export interface InlineLabelMatch {
  /** 라벨 텍스트 (사전 매치된 원형) */
  label: string;
  /** 값 시작 위치 (전체 텍스트 기준 offset) */
  valueStart: number;
  /** 매핑된 카테고리 */
  category: PIICategory;
}

/**
 * 텍스트에서 "라벨 + 값" cue를 찾아 값 구간을 카테고리와 함께 반환.
 * 값의 끝은 **같은 줄의 다음 cue 직전**, 또는 줄바꿈/탭/`|`, 또는 텍스트 끝.
 *
 * detector는 이 결과를 받아 [valueStart, valueEnd] 구간을 해당 카테고리로 강제 마스킹.
 */
export function findInlineLabels(text: string): Array<InlineLabelMatch & { valueEnd: number }> {
  // 경계 계산에는 두 티어의 cue를 모두 쓴다 — 사전에 없는 라벨("메모:")도
  // 앞 값의 끝을 정하는 역할은 해야 "성명: 김민수 메모: …"에서 과마스킹되지 않는다.
  const cues = [
    ...collectCues(text, LABEL_A_RE, 'A'),
    ...collectCues(text, LABEL_B_RE, 'B'),
  ].sort((a, b) => a.cueStart - b.cueStart || a.valueStart - b.valueStart);

  const out: Array<InlineLabelMatch & { valueEnd: number }> = [];
  // Tier A가 이미 값으로 claim한 구간 — Tier B가 그 안에서 다시 발화하는 것을 막는다.
  const claimed: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    if (!cue.resolved) continue;
    const { label, category } = cue.resolved;

    // 값의 끝 후보 1: 다음 cue의 라벨 시작 위치.
    let valueEnd = text.length;
    for (let j = i + 1; j < cues.length; j++) {
      const next = cues[j]!;
      if (next.cueStart > cue.valueStart) {
        valueEnd = Math.min(valueEnd, next.cueStart);
        break;
      }
    }
    // 값의 끝 후보 2: 구조 문자.
    for (let k = cue.valueStart; k < valueEnd; k++) {
      if (isValueBreak(text[k]!)) {
        valueEnd = k;
        break;
      }
    }
    // 우측 공백 제거 — 공백까지 마스킹하지 않도록.
    while (valueEnd > cue.valueStart && /\s/.test(text[valueEnd - 1]!)) valueEnd--;
    if (valueEnd <= cue.valueStart) continue;

    if (cue.tier === 'A') {
      out.push({ label, valueStart: cue.valueStart, valueEnd, category });
      claimed.push({ start: cue.valueStart, end: valueEnd });
      continue;
    }

    // ---- Tier B 게이트 ----
    if (!ID_CUE_CATEGORIES.has(category)) continue;
    // Tier A 값 안에서 재발화하지 않는다 ("계좌: 우리 1002-100-100100").
    if (claimed.some((c) => cue.valueStart >= c.start && cue.valueStart < c.end)) continue;

    const rest = text.slice(cue.valueStart, valueEnd);
    const vm =
      category === 'credential' ? CRED_VALUE_RE.exec(rest) : ID_VALUE_RE.exec(rest);
    if (!vm) continue;
    const value = vm[0];
    // credential 외에는 숫자를 포함해야 한다 — "카드 abcd" 같은 오탐 차단.
    if (category !== 'credential' && !/\d/.test(value)) continue;

    out.push({
      label,
      valueStart: cue.valueStart,
      valueEnd: cue.valueStart + value.length,
      category,
    });
  }

  return out.sort((a, b) => a.valueStart - b.valueStart);
}
