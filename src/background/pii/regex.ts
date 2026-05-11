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

// 한국 운전면허번호: AA-BB-CCCCCC-DD (지역2 + 발급연도2 + 일련6 + 검증2 = 12자리).
// 분리자 필수 — 분리자 없으면 일반 12자리 숫자열과 구분 불가하여 FP 폭증.
// 지역코드는 11~28(서울~인천 등)로 보수적으로 제한.
const DRIVER_LICENSE_PATTERN = /\b(?:1[1-9]|2[0-8])-\d{2}-\d{6}-\d{2}\b/g;

// 한국 법인등록번호: XXXXXX-XXXXXXX (6+7=13자리). 등기 법인 전용.
// 사업자등록번호(10자리)와 형태가 다름. 첫 6자리는 본·지점 분류·일련번호.
const CORPORATE_REG_PATTERN = /\b\d{6}-\d{7}\b/g;

// =============================================================================
// P1-2: 조직명 — v1.3에서 제거.
// =============================================================================
// 사용자 정의(2026-04-29): 조직명은 모두 PII 마스킹 대상에서 제외한다.
// 한국사회적기업진흥원·조달청·협동조합 등 공공·사기업·일반 단체 모두 PII 아님.
// 정규식 detector 제거 + NER ORG/COMPANY 라벨도 mapLabel에서 null 매핑 (model-runtime.ts).

// =============================================================================
// 날짜 — 생년월일·결재일 등 PII로 간주될 수 있는 절대 날짜
// =============================================================================
// YYYY-MM-DD, YYYY.M.D, YYYY/MM/DD, YYYY년 M월 D일 형식.
// 연도는 1900~2099로 보수적 제한 (문서 일자 + 생년월일 커버).
// 월·일 sanity는 detectDate에서 검증.
const DATE_NUMERIC_PATTERN =
  /\b(19|20)\d{2}[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])\b/g;
// 한국어: 1990년 1월 1일 / 1990년 01월 01일
const DATE_KOREAN_PATTERN =
  /\b(19|20)\d{2}년\s?(0?[1-9]|1[0-2])월\s?(0?[1-9]|[12]\d|3[01])일/g;

// =============================================================================
// 우편번호 — 한국 5자리 (00000~69999)
// =============================================================================
// 한국우편번호 체계: 신주소 우편번호 5자리, 범위 0XXXX~6XXXX (실제 6XXXX 후반부는 미사용).
// false positive 차단: 5자리 숫자는 흔하므로 boundary(\b)에 더해, 앞뒤가 영문/숫자가 아닌 경우만.
// 너무 좁으면 누락 — 라벨 동반('우편번호', '[우]') 또는 5자리 자체 boundary 매치.
const POSTAL_CODE_PATTERN = /(?<![A-Za-z0-9가-힣])[0-6]\d{4}(?![A-Za-z0-9가-힣])/g;

// =============================================================================
// 한국 주소 — 시도 + 시군구 + 도로/동명 + 상세
// =============================================================================
// 17개 광역자치단체 (2024 기준).
const KR_PROVINCES = [
  '서울특별시','서울시','서울',
  '부산광역시','부산시','부산',
  '대구광역시','대구시','대구',
  '인천광역시','인천시','인천',
  '광주광역시','광주시','광주',
  '대전광역시','대전시','대전',
  '울산광역시','울산시','울산',
  '세종특별자치시','세종시','세종',
  '경기도','경기',
  '강원특별자치도','강원도','강원',
  '충청북도','충북',
  '충청남도','충남',
  '전북특별자치도','전라북도','전북',
  '전라남도','전남',
  '경상북도','경북',
  '경상남도','경남',
  '제주특별자치도','제주도','제주',
];
const KR_PROVINCE_PATTERN = KR_PROVINCES.join('|');
// 시도 + (선택적) 시·군·구 + 동/로/길 + 번지/동호수까지. lookahead로 끝 boundary.
// 짧은 false positive(예: '서울 본부') 차단을 위해 도로명/동명/번지 중 1+ 토큰을 요구.
//
// 마지막 상세 부분: `5, 5-678` 같은 "번지 + 동호수" 형식까지 잡으려면 클래스에 공백·콤마
// 포함. 다음 줄로 새지 않게 줄바꿈은 제외 (\n/\r 제외, [ \t]만).
const ADDRESS_PATTERN = new RegExp(
  `(?:${KR_PROVINCE_PATTERN})` +
    // 시·군·구 (선택)
    `(?:\\s+[가-힣]{1,10}(?:시|군|구))?` +
    // 동·로·길 + 번지 (필수, 최소 1개)
    `\\s+[가-힣A-Za-z0-9]{1,20}(?:동|로|길|읍|면|리)` +
    // 번지·도로명 번호·동호수 상세 (선택). 공백·콤마·하이픈 포함.
    `(?:[ \\t,0-9가-힣\\-]{0,40})?`,
  'g',
);

// =============================================================================
// P2-1: 은행 prefix 기반 계좌번호 (정규식 패턴 화이트리스트 미포함 형식 보강)
// =============================================================================
// 회귀 테스트 코퍼스에서 다룬 자릿수 형식들:
//  하나 100-200300-40500 (3-6-5)
//  신한 100-200-30040 (3-3-5)
//  국민 100200-30-040506 (6-2-6 → RRN과 형태 충돌, but 은행명 prefix가 disambiguate)
//  우리 100-200304-05-060 (3-6-2-3)
//  하나 100-20-30405-6 (3-2-5-1)
const BANK_NAMES = [
  '국민','신한','우리','하나','농협','기업','수협','새마을','우체국',
  '경남','광주','대구','부산','전북','제주','씨티','SC제일','SC',
  '토스뱅크','카카오뱅크','케이뱅크','산업','한국씨티','KEB하나','KB국민',
];
const BANK_NAME_PATTERN = BANK_NAMES.join('|');
// 은행명 + 공백/탭 + (숫자/하이픈/공백) 조합. 숫자 시작·종료. 길이 8~25자.
// 너무 broad하지 않게: 처음/끝은 숫자, 중간에 1+개의 하이픈 또는 공백 허용.
const BANK_ACCOUNT_PATTERN = new RegExp(
  `(?:${BANK_NAME_PATTERN})\\s*\\d[\\d\\s\\-]{6,23}\\d`,
  'g',
);

// =============================================================================
// P2-2: 로마자 한국 이름 (CamelCase 또는 한국 성씨 영문 표기 + 이름)
// =============================================================================
// 한국 성씨 영문 표기 (top 30 정도). MR/RR/일반 변형 포함.
const ROMAN_KOREAN_SURNAMES = [
  'Kim','Lee','Park','Choi','Choe','Jung','Jeong','Chung',
  'Kang','Cho','Jo','Yoon','Yun','Jang','Chang',
  'Lim','Rim','Han','Oh','Suh','Seo','Shin','Sin','Kwon','Gwon',
  'Hwang','Ahn','An','Song','Ryu','Yoo','Yu',
  'Jeon','Jun','Hong','Ko','Go','Moon','Mun','Yang',
  'Son','Bae','Pae','Baek','Paik','Heo','Hur','Hu','Nam',
  'Sim','Shim','Roh','Noh','No','Ha','Ku','Koo','Gu',
  'Min','Jin','Chin','Ji','Yeon','Ham','Byun','Pyun',
];
const ROMAN_KOREAN_SURNAME_PATTERN = ROMAN_KOREAN_SURNAMES.join('|');
// 한국 성씨 영문 + 1~2개의 추가 CamelCase 단어 (이름).
//   "KimAB" "KimDoeFoo" "DoeFooKim" 같은 케이스.
// 두 가지 형태:
//   (a) [Surname][CamelCaseName]+   : KimAB, KimDoeFoo
//   (b) [CamelCaseName]+[Surname]   : DoeFooKim
// 파일명 안 (`_KimDoeFoo.pdf`)에서도 매치되도록 \b 대신 [A-Za-z0-9] 미포함 lookaround.
const ROMAN_NAME_PATTERN = new RegExp(
  // (a) Surname + (CamelCase 1~2자) 또는 (대문자 약어 2~4자). KimDoeFoo, KimAB 등.
  `(?<![A-Za-z0-9])(?:${ROMAN_KOREAN_SURNAME_PATTERN})(?:[A-Z][a-z]+){1,2}(?![A-Za-z0-9])|` +
    `(?<![A-Za-z0-9])(?:${ROMAN_KOREAN_SURNAME_PATTERN})[A-Z]{2,4}(?![A-Za-z0-9])|` +
    // (b) (CamelCase 1~2자) + Surname. DoeFooKim 등.
    `(?<![A-Za-z0-9])(?:[A-Z][a-z]+){1,2}(?:${ROMAN_KOREAN_SURNAME_PATTERN})(?![A-Za-z0-9])`,
  'g',
);
const ROMAN_NAME_STOPLIST: ReadonlySet<string> = new Set([
  // 일반 단어 (FP 가능성 — 미국식 약어 등)
  'JavaScript','TypeScript','GitHub','LinkedIn','OpenAI','PowerPoint',
  'NodeJS','MacOS','iOS','iPad','iPhone',
]);

// =============================================================================
// P3: 파일명 internal token — 이름과 정형단어가 구분자 없이 붙은 경우
// =============================================================================
// "임꺽정이력서_202402.doc"의 "임꺽정" 같이 [이름][정형단어]가 붙은 패턴.
// 정형단어 prefix를 lookahead로 — match는 이름 부분만.
const FILENAME_DOC_SUFFIXES = [
  '이력서','사본','면허','면허증','증명서','확인서','영수증','등본','초본',
  '진단서','신분증','통장','계좌','약력','경력서','이수증','수료증',
];
const FILENAME_DOC_SUFFIX_PATTERN = FILENAME_DOC_SUFFIXES.join('|');
// FILENAME_NAME_TOKEN은 SURNAME_CLASS 정의 후 만들어진다 (아래).

// 자격정보 prefix-based
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI/Anthropic
  /\b(?:xoxb|xoxp|xoxs|xoxa)-[A-Za-z0-9-]{16,}\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
  /\bASIA[0-9A-Z]{16}\b/g, // AWS temp credentials
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, // GitHub PAT/OAuth
  /\b(?:postgres|postgresql|mysql|mongodb|redis|amqp)(?:\+[a-z]+)?:\/\/[^\s:@]+:[^\s@]+@[^\s/]+/gi,
];

// 한국 성씨 (top 50 + sample에서 누락된 '선'). 더 큰 사전은 일반명사 충돌로
// FP 폭증 — top 50 외에는 stoplist 보강이 어려워 보수적으로 유지.
const KOREAN_SURNAMES = [
  '김','이','박','최','정','강','조','윤','장','임',
  '한','오','서','신','권','황','안','송','류','전',
  '홍','고','문','양','손','배','백','허','유','남',
  '심','노','하','곽','성','차','주','우','구','민',
  '진','지','연','함','변','염','여','추','도','소',
  '선', // 회귀 코퍼스에서 발견된 누락 (선아무 등)
];

// 복성 (2글자 성씨) — 분리 매칭. 흔치 않으나 누락 시 FN.
// 단성 일반명사("동방", "사공" 같은 단어)와 충돌 가능성은 낮음 (대부분 잘 쓰이지 않는 한자어).
const KOREAN_DOUBLE_SURNAMES = [
  '남궁','황보','제갈','사공','선우','서문','독고','을지',
];

const SURNAME_CLASS = `[${KOREAN_SURNAMES.join('')}]`;
const DOUBLE_SURNAME_PATTERN = KOREAN_DOUBLE_SURNAMES.join('|');
// 성+1~2자 이름 + (선택적) 존칭/직책.
// JS 정규식의 \b는 \w(ASCII) 기준이라 한글에서 동작 안 함 → lookbehind/lookahead 사용.
// 길이 desc 정렬 — alternation에서 긴 것 우선 매치 (예: "팀장님" > "팀장")
const TITLES = [
  '사무국장','이사장님','대표님','부장님','과장님','팀장님','회장님','사장님',
  '이사님','선생님','박사님','이사장','본부장','센터장','연구원','연구자',
  '교수님','교수','대표','부장','과장',
  '팀장','회장','사장','이사','국장','선생','박사','단장','님','씨',
];
const TITLE_PATTERN = TITLES.join('|');
// 직책 단독 매치 차단용 (사용자 정의: 직책은 PII가 아님 → "박사"·"교수"가 NAME 검출에 잡히면 안 됨).
const TITLE_SET: ReadonlySet<string> = new Set(TITLES);
// "팀장님" 다음에 조사("께","이","은")가 한글로 붙는 게 흔하므로 trailing boundary 제외.
// 단성(1자) 또는 복성(2자) + 1~3자 이름 + (선택적) 존칭/직책.
// 1~3자 이름 허용: 단성+1자(김민) ~ 단성+3자(김아무개), 복성+1자 ~ 복성+3자.
// title context가 강한 시그널이라 길이 확장에도 FP 위험 낮음.
const NAME_WITH_TITLE = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{1,3}|${SURNAME_CLASS}[가-힣]{1,3})(?=\\s?(?:${TITLE_PATTERN}))`,
  'g',
);
// 존칭 없이도 매칭하지만 confidence 낮음. 한국 이름은 거의 모두 3자(성+2자) — 2자 매칭은
// FP가 압도적(이사/주요/성명/관련/소속 등)이라 3자로 제한. 복성은 4자(복성+2자) 매칭.
//
// 끝 boundary는 (a) 다음이 한글이 아니거나, (b) 다음이 한국어 조사·접미사
// 화이트리스트 중 하나여야 매치. (b) 추가는 자연 문장 안 "조성도입니다"처럼
// 이름 + 조사가 붙는 케이스를 잡기 위함 — 4자 한자어 FP는 기존 stoplist가 차단.
const PARTICLE_AFTER_NAME =
  '(?:은|는|이|가|을|를|의|에|과|와|도|만|씨|님|입니다|에게|께|에서|보다|처럼|만큼|마저|조차|부터|까지|밖에|이라|이라고|라고|이며|이며|이다|이라는|이라며)';
const NAME_BARE = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{2})` +
    `(?:(?![가-힣])|(?=${PARTICLE_AFTER_NAME}))`,
  'g',
);

// P3: 파일명 internal token. SURNAME 정의가 위에 있으므로 여기서 컴파일.
const FILENAME_NAME_TOKEN = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{2})(?=(?:${FILENAME_DOC_SUFFIX_PATTERN}))`,
  'g',
);

// 컨텍스트 제한 2~4자 이름 — nameHintOnly 컬럼(신분증/통장사본/이력서 등)에서만 활성화.
// 양쪽이 한글/영문/숫자가 아닌 boundary(_, -, ., 공백, 줄 시작/끝)에 둘러싸인 경우만 매치.
// 일반 텍스트에서는 FP가 압도적이라 사용 금지 → detectContextualName으로 별도 export.
//   2자: 단성+1자(박영/오성/홍진)
//   3자: 일반 NAME_BARE가 잡지만, NFC 정규화 직후 같은 셀에서 누락된 경우 보강
//   4자: 단성+3자(김아무개) 또는 복성+2자(남궁아무). 4자는 stoplist 보강 필수.
const NAME_2CHAR_CONTEXT = new RegExp(
  `(?<![가-힣A-Za-z0-9])${SURNAME_CLASS}[가-힣](?![가-힣A-Za-z0-9])`,
  'g',
);
const NAME_4CHAR_CONTEXT = new RegExp(
  `(?<![가-힣A-Za-z0-9])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{3})(?![가-힣A-Za-z0-9])`,
  'g',
);
// 4자 일반 명사 stoplist — 한국 4자 한자어/표현이 boundary에 노출돼도 차단.
const NAME_4CHAR_STOPLIST: ReadonlySet<string> = new Set([
  '한국문화','한국정부','한국대표','한국사회','한국전쟁','한국역사',
  '서울특별','서울대학','서울지역','서울시청',
  '정부정책','정부지원','정부발표','정부조직',
  '연구개발','연구결과','연구방법','연구목적','연구진행','연구원장',
  '주요내용','주요사항','주요인물','주요업무',
  '심사위원','심사기준','심사방법',
  '조사결과','조사방법','조사대상',
  '소속단체','소속기관',
  '이사회의','이사진행',
]);
// 2자 이름 stoplist — boundary 기준으로 매치되더라도 흔한 명사면 차단.
const NAME_2CHAR_STOPLIST: ReadonlySet<string> = new Set([
  '이상','이하','이전','이후','이외','이내','이래','이번','이때','이런','이상',
  '이미','이것','이거','이게','이런','이걸','이를','이는','이로','이와','이도',
  '김치','김밥','김장',
  '주요','주말','주중','주차','주문','주제','주의','주기','주로',
  '도움','도시','도구','도장','도면','도서','도착','도전','도덕','도교',
  '서울','서명','서식','서류','서신','서재','서버',
  '소속','소개','소장','소요','소득','소비','소수','소형','소셜',
  '신청','신규','신문','신경','신용','신분','신호',
  '연구','연락','연결','연합','연속','연관','연수','연차','연단',
  '심사','심층','심리','심야','심야',
  '하나','하루','하반','하층',
  '백서','백분','백업','백두',
  '문의','문제','문서','문화','문구',
  '강조','강의','강사','강력','강수',
  '한국','한자','한글','한정','한반','한식','한복',
  '정도','정부','정보','정의','정리','정확','정상','정원','정직',
  '조사','조선','조직','조건','조절','조합','조용','조속',
  '변경','변동','변화','변수','변형',
  '오늘','오후','오전','오류','오해',
  '여러','여행','여건','여유','여전','여백',
]);

// 3자 매칭 중에도 흔한 일반명사/어미는 stoplist로 차단. 주기적으로 갱신 필요.
const NAME_BARE_STOPLIST: ReadonlySet<string> = new Set([
  // -시기/-니다 같은 동사 어미
  '주시기', '주신분', '주신다', '주시는', '주십시', '주시고', '주실수', '주는데',
  '주세요', '주실까', '주십니', '주셔서', '주셨어', '주실분', '주시오', '주신분',
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
  // P0-1: 정형 문서 양식의 헤더/필드명 — NPO/공공 양식에서 자주 출현.
  '이메일', '이력서', '신분증', '주민증', '주민세', '도서관', '도구함',
  '문구점', '문구류', '도면도', '도면집',
  '성씨가', '성씨는', '성씨를', '성씨의',
  '구분란', '구분자', '구분된', '구분의',
  '소요됨', '소요시', '소요된', '소요량',
  '여행객', '여행지', '여행기',
  '지원자', '지원을', '지원의', '지원이', '지원금', '지원서',
  '주문서', '주문량', '주문의', '주문된',
  '주차장', '주차장', '주차권',
  '주식회', // "주식회사"의 일부 매치 차단 (3자에서 끊는 false trigger)
  '백업본', '백업본', '백분위',
  '한가위', '한가운', '한가지', '한걸음',
  '강의장', '강의장', '강의록',
  '서비스', '서비스',
  '심사위', '심사를', '심사한', '심사진', '심사평', '심사의',
  '신문지', '신문사', '신문기',
  // v1.4 — paste/file 흐름에서 NAME_BARE 활성화에 따른 추가 일반어 차단
  '조달청', '선착순', '노트북', '하반기', '서울역', '서울숲', '서울대',
  '한국사', '한국공', '한국적', '한국형', '한국기',
  '진흥원', '연구원', '연구진', '연구실',
  '성장지', '성장기', '성장세', '성장률',
  '주차장', '주차권', '주차장',
  '도서관', '도구함', '도면집',
  '오전반', '오후반',
  '하루의', '하루는', '하루도', '하루만',
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

function detectDriverLicense(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(DRIVER_LICENSE_PATTERN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'driver_license',
      confidence: 0.85,
    });
  }
  return out;
}

function detectCorporateRegistration(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(CORPORATE_REG_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    if (digits.length !== 13) continue;
    // 노이즈 차단: 전부 같은 숫자 (000000-0000000 등)
    if (/^(\d)\1+$/.test(digits)) continue;
    // RRN/외국인등록번호와 형태 충돌: 7자리 suffix가 [1-8]로 시작하면 RRN 형태.
    // 검증 통과 시 detectRRN/detectForeigner가 잡고, 실패 시 어떤 카테고리도 잡지 않음
    // (typo이거나 NOT-PII). 법인등록번호로 promote하지 않는다.
    if (/^[1-8]/.test(digits.slice(6))) continue;
    // 진짜 법인등록번호의 7자리 suffix는 0 또는 9로 시작하는 일련번호 (등기 분류).
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'corporate_registration',
      confidence: 0.8,
    });
  }
  return out;
}

// 한국 이름 정규식 detector는 detectContextualName으로 일원화 (nameHintOnly 셀 한정).
// 일반 본문의 사람 이름은 NER이 책임. 조직명 detector는 v1.3에서 제거 — 사용자 정의상 PII 아님.

function detectDate(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(DATE_NUMERIC_PATTERN)) {
    if (m.index === undefined) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12) continue;
    if (day < 1 || day > (DAYS_IN_MONTH[month - 1] ?? 31)) continue;
    // 영문 version/build/release 컨텍스트 차단 — '2024.05.10'은 날짜 아니라 버전.
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (/\b(version|build|release|patch|rev|tag|v)\s+$/i.test(before)) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'date',
      confidence: 0.7,
    });
  }
  for (const m of text.matchAll(DATE_KOREAN_PATTERN)) {
    if (m.index === undefined) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12) continue;
    if (day < 1 || day > (DAYS_IN_MONTH[month - 1] ?? 31)) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'date',
      confidence: 0.85,
    });
  }
  return out;
}

function detectPostalCode(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(POSTAL_CODE_PATTERN)) {
    if (m.index === undefined) continue;
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const hasLabel = /우편\s?번호|\b(?:zip|postal)/i.test(before);
    // 영문 version/build/release 컨텍스트 차단 — 'build 12345'는 우편번호 아님.
    if (/\b(version|build|release|patch|rev|tag|v|no|num|number|id|port|pid)\s*[:#]?\s*$/i.test(before)) continue;
    // label 없는 단독 5자리는 한국어 컨텍스트 요구 — 영문 본문 false positive 차단.
    if (!hasLabel) {
      const around = text.slice(
        Math.max(0, m.index - 30),
        Math.min(text.length, m.index + m[0].length + 30),
      );
      if (!/[가-힣]/.test(around)) continue;
    }
    const confidence = hasLabel ? 0.9 : 0.55;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'postal_code',
      confidence,
    });
  }
  return out;
}

function detectAddress(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(ADDRESS_PATTERN)) {
    if (m.index === undefined) continue;
    // trailing 공백·콤마·하이픈 trim — `5, ` 같은 꼬리 정리.
    const matched = m[0].replace(/[\s,\-]+$/, '');
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'address',
      confidence: 0.75,
    });
  }
  return out;
}

// =============================================================================
// P2-1: 은행 prefix 계좌번호 detector
// =============================================================================
function detectBankAccount(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  for (const m of text.matchAll(BANK_ACCOUNT_PATTERN)) {
    if (m.index === undefined) continue;
    const digits = digitsOnly(m[0]);
    // 자릿수 sanity: 8~16자리. 너무 짧거나 길면 노이즈.
    if (digits.length < 8 || digits.length > 16) continue;
    // 모두 같은 숫자면 placeholder/dummy → 거부.
    if (/^(\d)\1+$/.test(digits)) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'account',
      confidence: 0.85,
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
  driver_license: 98,
  passport: 97,
  credential: 95,
  card: 90,
  corporate_registration: 86,
  business_number: 85,
  account: 80,
  mobile: 70,
  landline: 65,
  email: 60,
  person_name: 50,
  address: 40,
  postal_code: 35,
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

/**
 * 한국 이름 정규식 detector — nameHintOnly 컬럼(신분증/통장사본/이력서/후원자 명단 등)
 * 셀에서만 호출. 일반 본문에서는 사용 금지 (NAME_BARE의 일반어 FP가 압도적).
 *
 * v1.3: 사용자 정의에 따라 정규식 NAME 검출을 hintOnly cell로 일원화.
 * 일반 본문의 사람 이름은 NER(AEGIS 한국어 mBERT)이 컨텍스트 기반으로 책임진다.
 *
 * 포함 검출:
 *   - NAME_2CHAR_CONTEXT (boundary 제한 2자)
 *   - NAME_4CHAR_CONTEXT (boundary 제한 4자)
 *   - NAME_BARE          (3자 — 성+2자, stoplist + 조사 차단)
 *   - NAME_WITH_TITLE    (직책·존칭 동반)
 *   - FILENAME_NAME_TOKEN (파일명 internal token)
 *   - ROMAN_NAME_PATTERN  (로마자 한국 이름)
 */
export function detectContextualName(text: string): PIISpan[] {
  const out: PIISpan[] = [];
  // 2자 이름 (boundary 제한)
  for (const m of text.matchAll(NAME_2CHAR_CONTEXT)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_2CHAR_STOPLIST.has(matched)) continue;
    if (NAME_BARE_STOPLIST.has(matched)) continue;
    if (TITLE_SET.has(matched)) continue; // 직책 단독 매치 차단 (박사/교수/대표 등)
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.5,
      source: 'regex',
    });
  }
  // 4자 이름 (단성+3자 또는 복성+2자)
  for (const m of text.matchAll(NAME_4CHAR_CONTEXT)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_4CHAR_STOPLIST.has(matched)) continue;
    if (NAME_BARE_STOPLIST.has(matched)) continue;
    if (TITLE_SET.has(matched)) continue;
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    // 4자 끝이 조사·접미사(도/만/씨/님)면 실제 이름은 3자 — NAME_BARE에 양보. "김상철도"·"박지영님" 등.
    if ('도만씨님'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.4,
      source: 'regex',
    });
  }
  // 3자 NAME_BARE — 성+2자
  for (const m of text.matchAll(NAME_BARE)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_BARE_STOPLIST.has(matched)) continue;
    if (TITLE_SET.has(matched)) continue;
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.6,
      source: 'regex',
    });
  }
  // 직책/존칭 동반 — 높은 confidence
  for (const m of text.matchAll(NAME_WITH_TITLE)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.85,
      source: 'regex',
    });
  }
  // 파일명 internal token — "[이름][이력서|사본|...]"
  for (const m of text.matchAll(FILENAME_NAME_TOKEN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.7,
      source: 'regex',
    });
  }
  // 로마자 한국 이름 (Lee/Kim/... + CamelCase 또는 그 역순)
  for (const m of text.matchAll(ROMAN_NAME_PATTERN)) {
    if (m.index === undefined) continue;
    if (ROMAN_NAME_STOPLIST.has(m[0])) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.5,
      source: 'regex',
    });
  }
  // dedupe: 겹치는 매치 중 더 긴(또는 더 신뢰도 높은) 매치 우선.
  // 예: "남궁아무개 교수" → NAME_4CHAR("남궁아무") + NAME_WITH_TITLE("남궁아무개") → 후자 살린다.
  const raw: RawMatch[] = out.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    category: s.category,
    confidence: s.confidence,
  }));
  return dedupe(raw).map((m) => ({
    start: m.start,
    end: m.end,
    text: m.text,
    category: m.category,
    confidence: m.confidence,
    source: 'regex' as const,
  }));
}

/**
 * 일반 본문에서도 안전하게 쓸 수 있는 이름 detector — boundary 제한이 강한
 * NAME_BARE(3자) + NAME_WITH_TITLE(직책 동반) + FILENAME_NAME_TOKEN +
 * ROMAN_NAME_PATTERN만 사용. detectContextualName의 NAME_2CHAR/NAME_4CHAR는
 * 일반 본문 false positive가 압도적이라 제외 (이는 nameHintOnly 셀에서만 사용).
 *
 * v1.4: 사용자 보고 — paste 흐름에서 한국어 NER가 짧은 한글 이름(조성도)을
 * 놓치고 영문 subword(do)를 false positive로 출력하는 문제. 정규식 안전망으로 보강.
 * Stoplist + 직책 차단으로 일반어 false positive는 기존 수준 유지.
 */
export function detectGeneralName(text: string): PIISpan[] {
  const out: PIISpan[] = [];
  for (const m of text.matchAll(NAME_BARE)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_BARE_STOPLIST.has(matched)) continue;
    if (TITLE_SET.has(matched)) continue;
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.6,
      source: 'regex',
    });
  }
  for (const m of text.matchAll(NAME_WITH_TITLE)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.85,
      source: 'regex',
    });
  }
  for (const m of text.matchAll(FILENAME_NAME_TOKEN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.7,
      source: 'regex',
    });
  }
  for (const m of text.matchAll(ROMAN_NAME_PATTERN)) {
    if (m.index === undefined) continue;
    if (ROMAN_NAME_STOPLIST.has(m[0])) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.5,
      source: 'regex',
    });
  }
  const raw: RawMatch[] = out.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    category: s.category,
    confidence: s.confidence,
  }));
  return dedupe(raw).map((m) => ({
    start: m.start,
    end: m.end,
    text: m.text,
    category: m.category,
    confidence: m.confidence,
    source: 'regex' as const,
  }));
}

// =============================================================================
// Public entry
// =============================================================================

export function detectKoreanPII(text: string): PIISpan[] {
  // 일반 본문에서 사람 이름은 detectGeneralName(NAME_BARE/NAME_WITH_TITLE/
  // FILENAME_NAME_TOKEN/ROMAN_NAME_PATTERN)으로 잡는다. boundary 제한 2자/4자
  // 패턴은 nameHintOnly 셀 한정 detectContextualName에서만 사용.
  // 조직명은 사용자 정의상 PII가 아니라 정규식·NER 모두 제외.
  const generalNames = detectGeneralName(text).map<RawMatch>((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    category: s.category,
    confidence: s.confidence,
  }));
  const raw: RawMatch[] = [
    ...detectRRN(text),
    ...detectForeignerRegistration(text),
    ...detectPassport(text),
    ...detectDriverLicense(text),
    ...detectCorporateRegistration(text),
    ...detectBusinessNumber(text),
    ...detectCard(text),
    ...detectAccount(text),
    ...detectMobile(text),
    ...detectLandline(text),
    ...detectEmail(text),
    ...detectCredential(text),
    ...detectBankAccount(text),
    ...detectDate(text),
    ...detectPostalCode(text),
    ...detectAddress(text),
    ...generalNames,
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
