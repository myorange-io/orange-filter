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
    '주소', '거주지', '거주지주소', '자택주소', '회사주소', '집주소',
    'address', 'addr',
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

/**
 * 시트의 처음 N행 중 "헤더 행"으로 가장 적합한 행 인덱스 반환.
 * 휴리스틱: 사전과 매치되는 셀이 가장 많은 행. 매치 0건이면 undefined.
 *
 * `rows`는 시트의 처음 몇 행(원본 텍스트 그대로). 빈 셀은 빈 문자열.
 */
export function detectHeaderRow(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  scanLimit = 5,
): { rowIndex: number; categoryByCol: Map<number, PIICategory> } | undefined {
  let best: { rowIndex: number; categoryByCol: Map<number, PIICategory> } | undefined;
  const limit = Math.min(scanLimit, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const map = new Map<number, PIICategory>();
    for (let c = 0; c < row.length; c++) {
      const cat = categoryForHeader(row[c] ?? '');
      if (cat) map.set(c, cat);
    }
    if (map.size === 0) continue;
    if (!best || map.size > best.categoryByCol.size) {
      best = { rowIndex: r, categoryByCol: map };
    }
  }
  return best;
}

// =============================================================================
// 인라인 라벨 패턴: "성명: 조성도", "연락처 010-...", "이메일=foo@bar"
// 표 구조 없이 한 줄 또는 한 단락에 라벨/값이 같이 있는 경우.
// =============================================================================

// 라벨 + 구분자(: ＝ = 또는 공백 1개 이상) + 값.
// 라벨은 짧은(≤ 8자) 한국어/영문 토큰.
const INLINE_LABEL_RE = /([가-힣A-Za-z·.\-_/ ]{1,12})\s*[::＝=]\s*/g;

export interface InlineLabelMatch {
  /** 라벨 텍스트 (사전 매치된 원형) */
  label: string;
  /** 값 시작 위치 (전체 텍스트 기준 offset) */
  valueStart: number;
  /** 매핑된 카테고리 */
  category: PIICategory;
}

/**
 * 텍스트에서 "라벨: " 패턴을 찾고, 라벨이 사전과 매치되면 값의 시작 위치를 반환.
 * 같은 줄 내 다음 라벨 직전까지(또는 줄바꿈/탭/`|`까지)가 값의 범위.
 *
 * detector는 이 결과를 받아 [valueStart, valueEnd] 구간을 해당 카테고리로 강제 마스킹.
 */
export function findInlineLabels(text: string): Array<InlineLabelMatch & { valueEnd: number }> {
  const out: Array<InlineLabelMatch & { valueEnd: number }> = [];
  INLINE_LABEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_LABEL_RE.exec(text)) !== null) {
    const label = m[1]?.trim() ?? '';
    const cat = categoryForHeader(label);
    if (!cat) continue;
    const valueStart = m.index + m[0].length;
    // 값의 끝: 다음 줄바꿈/탭/`|` 또는 텍스트 끝.
    let valueEnd = text.length;
    for (let i = valueStart; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === '\n' || ch === '\r' || ch === '\t' || ch === '|') {
        valueEnd = i;
        break;
      }
    }
    if (valueEnd > valueStart) {
      out.push({ label, valueStart, valueEnd, category: cat });
    }
  }
  return out;
}
