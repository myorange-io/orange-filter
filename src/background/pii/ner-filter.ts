// NER 모델 결과의 false positive 필터.
//
// 동기 (v1.4): 사용자 보고 — paste 흐름에서 한국어 NER가 영문 subword 'do'(예: 'Cho, Sungdo'의
// 마지막 토큰)를 person_name으로 잘못 분류. mBERT subword 토크나이저 + threshold 차이로
// 한글 '조성도'는 놓치고 'do' 단독만 살아남는 경향.
//
// 정규식 결과는 영향받지 않음 — 이 필터는 NER 결과만 받아서 mergeSpans 직전에 호출.
// 정확도 vs 회수율 trade-off: 한국 양식 텍스트에서 영문 짧은 토큰의 person_name FP가
// FN보다 압도적이라 이 필터는 net 양수.

import type { PIISpan } from '@/shared/types';

/**
 * 한국어 학문 분야·일반어 stoplist — AEGIS NER이 SURNAME+GIVENNAME으로 잘못 라벨링하는 단어.
 *
 * 동기 (HWPX 강연자 서류 케이스): NER이 "심리학"을 SURNAME(심)+GIVENNAME(리학)로 분리 라벨링하면
 * `mergeAdjacentNames`가 한 person_name 스팬으로 머지해 마스킹 대상이 된다. 학과·전공·학문
 * 분야명은 사적 식별 정보가 아니므로 후처리에서 차단한다.
 */
const KOREAN_NAME_FP_STOPLIST: ReadonlySet<string> = new Set([
  // 학문 분야
  '심리학', '사회학', '경제학', '경영학', '행정학', '회계학', '통계학',
  '철학', '문학', '수학', '과학', '미학', '신학', '의학', '약학',
  '인문학', '윤리학', '정치학', '교육학', '논리학', '언어학',
  '물리학', '화학', '생물학', '지리학', '지질학', '천문학',
  '국문학', '영문학', '간호학', '인류학', '고고학', '해양학', '환경학',
  // 학과·전공 접미사가 붙는 보편 명사 (NER이 surname 시작으로 잘못 보는 케이스)
  '심리', '윤리', '논리', '진리', '도리',
]);

/**
 * 영문 stopword 블랙리스트 — NER이 PERSON으로 자주 잘못 분류하는 짧은 토큰.
 * 영문 한국식 이름 'Lee'/'Kim' 등은 ROMAN_KOREAN_SURNAMES와 겹치지 않게 의도적 제외.
 */
const ENGLISH_STOPWORDS: ReadonlySet<string> = new Set([
  // 대명사·조동사·전치사·관사 — 짧은 만큼 NER 오인 빈도 ↑
  'do', 'is', 'us', 'me', 'it', 'he', 'she', 'they', 'we', 'i', 'you',
  'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
  'to', 'of', 'for', 'at', 'in', 'on', 'by', 'with', 'from', 'up', 'down',
  'an', 'a', 'the', 'and', 'or', 'but', 'if', 'so', 'no', 'yes', 'not', 'too', 'very',
  // 흔한 영어 약어 (조직 접미사)
  'inc', 'ltd', 'co', 'corp', 'llc', 'plc',
  // 시각·시간대
  'am', 'pm', 'utc', 'gmt', 'est', 'pst', 'kst',
  // 직책·존칭
  'mr', 'ms', 'mrs', 'dr', 'sr', 'jr', 'st',
  // 짧은 부서·기능 약어
  'ok', 'okay', 'cs', 'hr', 'pr', 'qa', 'ux', 'ui', 'ai', 'ml', 'os',
]);

/** 짧은 ASCII 토큰의 confidence 임계 — 미만이면 drop */
const SHORT_ASCII_CONFIDENCE_THRESHOLD = 0.85;
const SHORT_ASCII_LENGTH_THRESHOLD = 3;

function isShortAsciiToken(text: string): boolean {
  return text.length <= SHORT_ASCII_LENGTH_THRESHOLD && /^[A-Za-z]+$/.test(text);
}

/**
 * NER 결과 spans에서 person_name false positive 후보를 필터.
 *
 * 필터 규칙:
 *   1. 영문 stopword 블랙리스트(대소문자 무관) → drop
 *   2. ASCII 알파벳만 + 길이 ≤ 3 + confidence < 0.85 → drop (예: 'do', 'is')
 *   3. 한국어 학문 분야·일반어 stoplist (심리학·경제학·…) → drop
 *
 * person_name 외 카테고리는 통과. 정규식 결과는 호출자가 별도 처리.
 */
export function filterNerFalsePositives(spans: ReadonlyArray<PIISpan>): PIISpan[] {
  const out: PIISpan[] = [];
  for (const s of spans) {
    if (s.category !== 'person_name') {
      out.push(s);
      continue;
    }
    const t = s.text.trim();
    if (ENGLISH_STOPWORDS.has(t.toLowerCase())) continue;
    if (isShortAsciiToken(t) && s.confidence < SHORT_ASCII_CONFIDENCE_THRESHOLD) continue;
    if (KOREAN_NAME_FP_STOPLIST.has(t)) continue;
    out.push(s);
  }
  return out;
}
