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
// P1-2: 조직명 (○○대, ○○법인, ○○재단 등)
// =============================================================================
// 한국어 + 영문 약어 (KAIST, POSTECH, UNIST, GIST, DGIST 등) 모두 포괄.
// 본 패턴은 "반드시 조직"인 키워드 suffix 다음에서만 매치 — FP 최소화.
const ORGANIZATION_SUFFIXES = [
  '대학교','대학원','대학','법인','재단','학원','연구소','연구원',
  '위원회','협의회','협회','기관','학회','조합','상사','은행','공사',
  '센터','회사','병원','학교','복지관','진흥원','개발원','진흥회',
];
const ORGANIZATION_SUFFIX_PATTERN = ORGANIZATION_SUFFIXES.join('|');
const ORGANIZATION_KOREAN = new RegExp(
  `(?<![가-힣])[가-힣]{2,8}(?:${ORGANIZATION_SUFFIX_PATTERN})(?![가-힣])`,
  'g',
);
// organization 일반명사 stoplist — 양식 안내문에서 자주 등장.
const ORGANIZATION_STOPLIST: ReadonlySet<string> = new Set([
  '공익법인','비영리법인','사단법인','재단법인','학교법인','종교법인',
  '의료법인','특수법인','외국법인','영리법인',
  '비영리재단','비영리단체','비영리법인',
  '공시 표준서식', '결산공시',
]);
// 영문 약어 대학·연구소 (KAIST/POSTECH/UNIST 등)
const ORGANIZATION_ACRONYM_KO_INSTITUTIONS = new Set([
  'KAIST','POSTECH','UNIST','GIST','DGIST','KIST','ETRI','KISTI',
  'SNU','KU','YU','HU','SKKU','CAU','EWHA','HUFS','DGU','KHU','PNU',
  'KITRI','KISA','NIA','KOSEN',
]);
const ACRONYM_PATTERN = /\b[A-Z]{3,8}\b/g;

// =============================================================================
// P2-1: 은행 prefix 기반 계좌번호 (정규식 패턴 화이트리스트 미포함 형식 보강)
// =============================================================================
// 사용자 데이터 분석에서 발견된 누락 형식들:
//  하나 100-200300-40500 (3-6-5)
//  신한 100-200-30040 (3-3-5)
//  국민 100200-30-040506 (6-2-6 → RRN과 형태 충돌, but 은행명 prefix가 disambiguate)
//  우리 100-200304-05-060 (3-6-2-3)
//  하나 296-18-09507-8 (3-2-5-1)
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
  '선', // sample 회귀에서 발견된 누락 (선아무)
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
const NAME_BARE = new RegExp(
  `(?<![가-힣])(?:(?:${DOUBLE_SURNAME_PATTERN})[가-힣]{2}|${SURNAME_CLASS}[가-힣]{2})(?![가-힣])`,
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
    // 마지막 글자가 명백한 조사면 단어+조사 — name 아님.
    // '만'/'도'는 조사이기도 하지만 한국 이름 끝글자로도 흔함(지석만, 김민도) → 제외.
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.4,
    });
  }
  // P3: 파일명 internal token — "[이름][이력서|사본|...]" 구분자 없이 붙은 경우.
  for (const m of text.matchAll(FILENAME_NAME_TOKEN)) {
    if (m.index === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.7,
    });
  }
  // P2-2: 로마자 한국 이름 (Lee/Kim/... + CamelCase 또는 그 역순).
  for (const m of text.matchAll(ROMAN_NAME_PATTERN)) {
    if (m.index === undefined) continue;
    if (ROMAN_NAME_STOPLIST.has(m[0])) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'person_name',
      confidence: 0.5,
    });
  }
  return out;
}

// =============================================================================
// P1-2: 조직명 detector
// =============================================================================
function detectOrganization(text: string): RawMatch[] {
  const out: RawMatch[] = [];
  // 한국어: ○○대학교, ○○법인, ○○재단 등
  for (const m of text.matchAll(ORGANIZATION_KOREAN)) {
    if (m.index === undefined) continue;
    if (ORGANIZATION_STOPLIST.has(m[0])) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'organization',
      confidence: 0.7,
    });
  }
  // 영문 약어 (KAIST, POSTECH 등) — 화이트리스트 매치만.
  for (const m of text.matchAll(ACRONYM_PATTERN)) {
    if (m.index === undefined) continue;
    if (!ORGANIZATION_ACRONYM_KO_INSTITUTIONS.has(m[0])) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      category: 'organization',
      confidence: 0.85,
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
 * 컨텍스트 제한 2자 한국 이름 detector — nameHintOnly 컬럼(신분증/통장사본/이력서 등)
 * 셀에서만 호출. 일반 텍스트에서는 사용 금지 (FP 압도적).
 *
 * 매치 조건:
 * - 양쪽이 한글/영문/숫자가 아닌 boundary (`_`, `-`, `.`, 공백 등)
 * - top 50 surname + 1글자 한글
 * - stoplist 미포함
 * - 마지막 글자가 명백한 조사 아님
 */
export function detectContextualName(text: string): PIISpan[] {
  const out: PIISpan[] = [];
  // 2자 이름
  for (const m of text.matchAll(NAME_2CHAR_CONTEXT)) {
    if (m.index === undefined) continue;
    const matched = m[0];
    if (NAME_2CHAR_STOPLIST.has(matched)) continue;
    if (NAME_BARE_STOPLIST.has(matched)) continue;
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
    const last = matched[matched.length - 1]!;
    if ('을를이가은는의에께와과로'.includes(last)) continue;
    out.push({
      start: m.index,
      end: m.index + matched.length,
      text: matched,
      category: 'person_name',
      confidence: 0.4,
      source: 'regex',
    });
  }
  return out;
}

// =============================================================================
// Public entry
// =============================================================================

export function detectKoreanPII(text: string): PIISpan[] {
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
    ...detectKoreanName(text),
    ...detectOrganization(text),
    ...detectBankAccount(text),
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
