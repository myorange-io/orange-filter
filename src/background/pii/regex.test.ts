import { describe, expect, it } from 'vitest';
import {
  detectContextualName,
  detectKoreanPII,
  validateBusinessNumberChecksum,
  validateForeignerRegistrationChecksum,
  validateLuhn,
  validateRRNChecksum,
} from './regex';

// =============================================================================
// 체크섬 단위 테스트
// =============================================================================

describe('validateRRNChecksum', () => {
  // 사전에 손으로 계산해 검증한 합성 RRN. 실제 발급된 번호 아님.
  const VALID = ['9505101234567', '0012313456783', '8801011234568'];
  const INVALID_CHECKSUM = ['9505101234560', '0012313456780', '8801011234560'];

  it.each(VALID)('유효한 RRN 체크섬: %s', (digits) => {
    expect(validateRRNChecksum(digits)).toBe(true);
  });

  it.each(INVALID_CHECKSUM)('잘못된 체크섬은 거절: %s', (digits) => {
    expect(validateRRNChecksum(digits)).toBe(false);
  });

  it('월 13 등 잘못된 월은 거절', () => {
    expect(validateRRNChecksum('9513101234567')).toBe(false);
  });

  it('2월 31일 등 잘못된 일은 거절', () => {
    expect(validateRRNChecksum('9502311234567')).toBe(false);
  });

  it('월 0은 거절', () => {
    expect(validateRRNChecksum('9500101234567')).toBe(false);
  });

  it('일 0은 거절', () => {
    expect(validateRRNChecksum('9501001234567')).toBe(false);
  });

  it('길이 12는 거절', () => {
    expect(validateRRNChecksum('950510123456')).toBe(false);
  });

  it('길이 14는 거절', () => {
    expect(validateRRNChecksum('95051012345670')).toBe(false);
  });

  it('숫자 외 문자 포함은 거절', () => {
    expect(validateRRNChecksum('950510a234567')).toBe(false);
  });
});

describe('validateForeignerRegistrationChecksum', () => {
  // 외국인등록번호: RRN과 같은 가중치 + (+2) 보정. 7번째 자리 5-8.
  const VALID = ['9505105234560', '8803057234562'];
  const INVALID = [
    '9505101234567', // 7번째 자리 1 (한국인 RRN 코드)
    '9505105234567', // 7번째는 5라도 체크섬 잘못
  ];

  it.each(VALID)('유효한 외국인등록번호: %s', (digits) => {
    expect(validateForeignerRegistrationChecksum(digits)).toBe(true);
  });

  it.each(INVALID)('잘못된 케이스 거절: %s', (digits) => {
    expect(validateForeignerRegistrationChecksum(digits)).toBe(false);
  });

  it('7번째 자리 9는 거절 (5-8 범위 외)', () => {
    expect(validateForeignerRegistrationChecksum('9505109234567')).toBe(false);
  });
});

describe('validateBusinessNumberChecksum', () => {
  // 가중치 [1,3,7,1,3,7,1,3,5] + d[8]*5//10
  const VALID = ['1208612347', '2118615387'];
  const INVALID = ['1208612340', '2118615388'];

  it.each(VALID)('유효한 사업자번호: %s', (digits) => {
    expect(validateBusinessNumberChecksum(digits)).toBe(true);
  });

  it.each(INVALID)('잘못된 사업자번호 체크섬 거절: %s', (digits) => {
    expect(validateBusinessNumberChecksum(digits)).toBe(false);
  });

  it('길이 9는 거절', () => {
    expect(validateBusinessNumberChecksum('120861234')).toBe(false);
  });
});

describe('validateLuhn', () => {
  // 표준 테스트 카드 번호
  const VALID = [
    '4242424242424242', // Stripe 테스트 Visa
    '5555555555554444', // Stripe 테스트 MC
    '378282246310005', // Amex 15자리
    '6011111111111117', // Discover
  ];
  const INVALID = ['1234567890123456', '4242424242424241', '0000000000000000'];

  it.each(VALID)('유효한 Luhn: %s', (digits) => {
    expect(validateLuhn(digits)).toBe(true);
  });

  it.each(INVALID)('잘못된 Luhn 거절: %s', (digits) => {
    expect(validateLuhn(digits)).toBe(false);
  });

  it('너무 짧은 입력 거절', () => {
    expect(validateLuhn('123456789012')).toBe(false);
  });

  it('숫자 외 문자 포함 거절', () => {
    expect(validateLuhn('4242a242424242')).toBe(false);
  });
});

// =============================================================================
// detectKoreanPII 통합 테스트
// =============================================================================

describe('detectKoreanPII', () => {
  it('빈 문자열에 대해 빈 결과', () => {
    expect(detectKoreanPII('')).toEqual([]);
  });

  it('PII 없는 텍스트는 빈 결과', () => {
    const text = '안녕하세요, 오늘 날씨가 좋네요. 점심은 김치찌개 어떨까요?';
    // "김치찌개"의 "김"이 성씨 사전에 있어 person_name bare match가 발생할 수 있음.
    // confidence 0.4 짜리만 떠야 함. (FP는 의도된 동작)
    const result = detectKoreanPII(text);
    // RRN/카드/계좌 등 high-confidence PII는 0건이어야 함
    expect(
      result.filter((s) => s.confidence >= 0.7),
    ).toEqual([]);
  });

  it('주민등록번호 (하이픈 포함) 매칭', () => {
    const text = '제 주민번호는 950510-1234567 입니다.';
    const spans = detectKoreanPII(text);
    const rrn = spans.find((s) => s.category === 'rrn');
    expect(rrn).toBeDefined();
    expect(rrn?.text).toBe('950510-1234567');
    expect(rrn?.source).toBe('regex');
    expect(rrn?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('주민등록번호 (하이픈 없음) 매칭', () => {
    const text = '주민번호 9505101234567 등록 완료.';
    const spans = detectKoreanPII(text);
    const rrn = spans.find((s) => s.category === 'rrn');
    expect(rrn?.text).toBe('9505101234567');
  });

  it('잘못된 체크섬의 RRN 같은 숫자는 매칭 안 됨', () => {
    const text = '주민번호 950510-1234560 (잘못된 체크섬)';
    const spans = detectKoreanPII(text);
    expect(spans.find((s) => s.category === 'rrn')).toBeUndefined();
  });

  it('휴대폰 다양한 포맷', () => {
    const cases = [
      '010-1234-5678',
      '01012345678',
      '010 1234 5678',
      '011-234-5678',
    ];
    for (const phone of cases) {
      const spans = detectKoreanPII(`연락처: ${phone}`);
      expect(
        spans.find((s) => s.category === 'mobile'),
        `매칭 실패: ${phone}`,
      ).toBeDefined();
    }
  });

  it('이메일 매칭', () => {
    const text = '문의: contact@example.org 또는 test+tag@npo.kr 로 보내주세요.';
    const spans = detectKoreanPII(text).filter((s) => s.category === 'email');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.text).toBe('contact@example.org');
  });

  it('카드번호 (Luhn 통과) 매칭', () => {
    const text = '카드 4242-4242-4242-4242 결제 완료.';
    const spans = detectKoreanPII(text);
    const card = spans.find((s) => s.category === 'card');
    expect(card?.text).toBe('4242-4242-4242-4242');
  });

  it('카드번호 (Luhn 실패) 미매칭', () => {
    const text = '랜덤 16자리: 1234-5678-9012-3456';
    const spans = detectKoreanPII(text);
    expect(spans.find((s) => s.category === 'card')).toBeUndefined();
  });

  it('OpenAI/Anthropic API key 매칭', () => {
    const text = 'API key: sk-abc123def456ghi789jkl012mno345 (시크릿)';
    const spans = detectKoreanPII(text);
    const cred = spans.find((s) => s.category === 'credential');
    expect(cred).toBeDefined();
    expect(cred?.text).toMatch(/^sk-/);
  });

  it('AWS access key 매칭', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE 가 유출됐어요.';
    const spans = detectKoreanPII(text);
    const cred = spans.find((s) => s.category === 'credential');
    expect(cred?.text).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('Postgres 커넥션 문자열 매칭', () => {
    const text = 'DATABASE_URL=postgres://admin:secret123@db.host:5432/app';
    const spans = detectKoreanPII(text);
    const cred = spans.find((s) => s.category === 'credential');
    expect(cred).toBeDefined();
    expect(cred?.text).toContain('postgres://');
  });

  it('한국 여권 번호 매칭', () => {
    const text = '여권 M12345678 분실 신고.';
    const spans = detectKoreanPII(text);
    const passport = spans.find((s) => s.category === 'passport');
    expect(passport?.text).toBe('M12345678');
  });

  it('운전면허번호 매칭 (12자리 4-segment)', () => {
    const text = '운전면허 11-25-123456-78 정보입니다.';
    const spans = detectKoreanPII(text);
    const dl = spans.find((s) => s.category === 'driver_license');
    expect(dl?.text).toBe('11-25-123456-78');
  });

  it('운전면허번호 미매칭 — 분리자 없거나 지역코드 범위 밖', () => {
    // 분리자 없는 12자리는 RRN/계좌 등과 구분 불가 → 매칭 X
    expect(
      detectKoreanPII('번호 112512345678').find(
        (s) => s.category === 'driver_license',
      ),
    ).toBeUndefined();
    // 지역코드 30~ 등 범위 밖
    expect(
      detectKoreanPII('30-25-123456-78').find(
        (s) => s.category === 'driver_license',
      ),
    ).toBeUndefined();
  });

  it('법인등록번호 매칭 (13자리, 6-7 분리, 실 형식)', () => {
    // 실제 법인등록번호 7자리 suffix는 일련번호로 0 또는 9로 시작 (등기 분류상)
    const text = '법인등록번호 130111-0006246 입니다.';
    const spans = detectKoreanPII(text);
    const corp = spans.find((s) => s.category === 'corporate_registration');
    expect(corp?.text).toBe('130111-0006246');
  });

  it('법인등록번호 미매칭 — RRN/외국인 형태(suffix 1-8 시작)와 충돌 시 양보', () => {
    // RRN format으로 보이는 invalid 번호는 corporate로 fallback하지 않음 (FP 방지)
    expect(
      detectKoreanPII('900101-1234500').find(
        (s) => s.category === 'corporate_registration',
      ),
    ).toBeUndefined();
  });

  it('법인등록번호 미매칭 — 전부 같은 숫자', () => {
    expect(
      detectKoreanPII('번호 000000-0000000').find(
        (s) => s.category === 'corporate_registration',
      ),
    ).toBeUndefined();
    expect(
      detectKoreanPII('번호 111111-1111111').find(
        (s) => s.category === 'corporate_registration',
      ),
    ).toBeUndefined();
  });

  it('v1.3: 일반 본문에서는 정규식이 사람 이름을 잡지 않는다 (NER이 책임)', () => {
    // 사용자 정의: 일반 본문의 NAME 검출은 NER에 위임. 정규식 NAME은 hintOnly cell만.
    expect(detectKoreanPII('김민수 팀장님께 보고드렸습니다.').filter((s) => s.category === 'person_name')).toEqual([]);
    expect(detectKoreanPII('박지성').filter((s) => s.category === 'person_name')).toEqual([]);
    // 양식 안내문의 일반어도 잡지 않는다 (선착순/노트북/하반기/조달청 등 FP 차단).
    for (const text of ['선착순 모집', '노트북을 지참', '하반기에 진행', '조달청 공고']) {
      expect(detectKoreanPII(text).filter((s) => s.category === 'person_name')).toEqual([]);
    }
  });

  it('v1.3: 조직명도 일반 본문에서 잡지 않는다 (사용자 정의: 조직명은 PII 아님)', () => {
    for (const text of [
      '한국사회적기업진흥원 공고',
      '서울대학교 총장',
      '아름다운재단 후원',
      'KAIST 교수',
      '협동조합 연합회',
    ]) {
      expect(detectKoreanPII(text).filter((s) => s.category === 'organization')).toEqual([]);
    }
  });

  it('detectContextualName: 직책 동반 이름은 hintOnly cell에서 잡힘 (high confidence)', () => {
    const name = detectContextualName('김민수 팀장님께 보고드렸습니다.').find(
      (s) => s.category === 'person_name' && s.confidence >= 0.8,
    );
    expect(name?.text).toBe('김민수');
  });

  it('detectContextualName: bare 3자 이름은 hintOnly cell에서 잡힘', () => {
    const name = detectContextualName('박지성').find((s) => s.category === 'person_name');
    expect(name?.text).toBe('박지성');
  });

  it('2자 surname-prefix 단어는 매칭 X (이사/주요/성명/도움)', () => {
    for (const text of ['이사', '주요', '성명', '도움', '구두']) {
      const spans = detectKoreanPII(text);
      expect(spans.find((s) => s.category === 'person_name')).toBeUndefined();
    }
  });

  it('흔한 3자 일반명사/어미 stoplist (구성원/주시기/이사장/한국의)', () => {
    for (const text of [
      '주요 구성원 현황',
      '작성하여 주시기 바랍니다',
      '이사장 인사말',
      '한국의 비영리',
      '정부의 발표',
      '여러분 안녕',
    ]) {
      const spans = detectKoreanPII(text);
      const names = spans.filter((s) => s.category === 'person_name');
      expect(names).toEqual([]);
    }
  });

  it('detectContextualName: 실제 인명 3자 매칭 (이의헌/김난일/김강석)', () => {
    for (const text of ['이의헌 외 6인', '김난일 비상임', '대표 김강석']) {
      const names = detectContextualName(text).filter((s) => s.category === 'person_name');
      expect(names.length).toBeGreaterThan(0);
    }
  });

  it('detectContextualName: 자연 문장 안 이름 + 한국어 조사 매칭 (Finding 1)', () => {
    // 자연 한국어 문장에서 이름 뒤에 조사·접미사가 붙어도 매치돼야 한다.
    const cases: Array<[string, string]> = [
      ['안녕하세요, 조성도입니다.', '조성도'],
      ['김민수씨에게 전달했습니다', '김민수'],
      ['박지영님께 문의', '박지영'],
      ['홍길동은 어디 있나?', '홍길동'],
      ['이순신이라고 합니다', '이순신'],
      ['최영민의 책', '최영민'],
      ['김상철도 같이 왔다', '김상철'],
    ];
    for (const [text, expected] of cases) {
      const names = detectContextualName(text).filter((s) => s.category === 'person_name');
      expect(names.map((n) => n.text), `case "${text}"`).toContain(expected);
    }
  });

  it('Finding 1: 조사 화이트리스트가 4자 한자어 FP를 만들지 않음', () => {
    // "한국문화", "주요내용" 같은 4자 한자어는 stoplist 또는 길이 제한으로 차단.
    // (조사 lookahead는 NAME_BARE 끝 boundary 완화이지 4자 매치 추가가 아님)
    for (const text of ['한국문화는 다양', '주요내용은 다음', '연구결과의 의의']) {
      const spans = detectKoreanPII(text);
      // 3자 NAME_BARE 매치는 가능하지만 stoplist에 들어있는 경우만 차단되어야 한다.
      // 본 테스트는 "기존 stoplist가 의도대로 작동" 여부의 sanity check.
      const names = spans.filter((s) => s.category === 'person_name');
      // 무엇이 매치되든 명백한 일반명사 그대로는 등장하지 않아야 한다.
      expect(names.map((n) => n.text)).not.toContain('한국문');
      expect(names.map((n) => n.text)).not.toContain('주요내');
    }
  });

  it('계좌번호와 카드번호가 충돌하면 카드 우선 (Luhn 통과 시)', () => {
    // 4242-4242-4242-4242는 16자리 + Luhn 통과 → card로
    const text = '계좌인지 카드인지: 4242-4242-4242-4242';
    const spans = detectKoreanPII(text);
    expect(spans.find((s) => s.category === 'card')).toBeDefined();
    expect(spans.find((s) => s.category === 'account')).toBeUndefined();
  });

  it('스팬은 텍스트 위치 정렬 순서로 반환', () => {
    const text = '연락처 010-1234-5678 이메일 a@b.com 카드 4242424242424242';
    const spans = detectKoreanPII(text);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    }
  });

  it('스팬의 start/end가 원본 텍스트의 정확한 위치', () => {
    const text = '문의: contact@example.org 입니다.';
    const span = detectKoreanPII(text).find((s) => s.category === 'email')!;
    expect(text.slice(span.start, span.end)).toBe('contact@example.org');
  });

  it('여러 PII가 한 텍스트에 — 모두 잡힘', () => {
    const text = `
      후원자 명단:
      홍길동 부장 (010-1111-2222) 950510-1234567
      이순신 (admin@example.org), 카드 5555-5555-5555-4444
    `;
    const spans = detectKoreanPII(text);
    const categories = new Set(spans.map((s) => s.category));
    expect(categories.has('rrn')).toBe(true);
    expect(categories.has('mobile')).toBe(true);
    expect(categories.has('email')).toBe(true);
    expect(categories.has('card')).toBe(true);
  });

  // ===========================================================================
  // P1-1 + P1-2 + P2-1 + P2-2 + P3 회귀
  // ===========================================================================

  it('detectContextualName: surname "선" + 복성 (남궁/황보/제갈) 추가 매칭 (P1-1)', () => {
    expect(detectContextualName('선아무 박사').find((s) => s.category === 'person_name')).toBeDefined();
    expect(detectContextualName('남궁아무 교수').find((s) => s.category === 'person_name')).toBeDefined();
    expect(detectContextualName('황보아무 대표').find((s) => s.category === 'person_name')).toBeDefined();
  });

  it('v1.3: 일반명사 (공익법인/비영리법인 단독) — organization 카테고리 자체가 잡히지 않음', () => {
    // 사용자 정의: 조직명은 모두 PII 아님 → organization detector 제거. 부수 효과로 일반명사도 차단됨.
    expect(detectKoreanPII('공익법인 결산서류').filter((s) => s.category === 'organization')).toEqual([]);
    expect(detectKoreanPII('비영리법인은').filter((s) => s.category === 'organization')).toEqual([]);
  });

  it('P2-1: 은행 prefix + 자릿수 다양 형식 (정규식 화이트리스트 미포함)', () => {
    expect(detectKoreanPII('하나 100-200300-40500').find((s) => s.category === 'account')).toBeDefined();
    expect(detectKoreanPII('신한 100-200-30040').find((s) => s.category === 'account')).toBeDefined();
    expect(detectKoreanPII('국민 100200-30-040506').find((s) => s.category === 'account')).toBeDefined();
    expect(detectKoreanPII('우리 100-200304-05-060').find((s) => s.category === 'account')).toBeDefined();
  });

  it('detectContextualName: 로마자 한국 이름 (P2-2)', () => {
    expect(detectContextualName('Contact: KimAB').find((s) => s.category === 'person_name')).toBeDefined();
    expect(detectContextualName('CV_KimDoeFoo.pdf').find((s) => s.category === 'person_name')).toBeDefined();
    expect(detectContextualName('CV_DoeFooKim.pdf').find((s) => s.category === 'person_name')).toBeDefined();
  });

  it('detectContextualName: 파일명 internal token (P3)', () => {
    // 이름 부분만 매치 (suffix는 lookahead).
    const span1 = detectContextualName('14. 임꺽정이력서_202402.doc').find((s) => s.category === 'person_name');
    expect(span1?.text).toBe('임꺽정');
    const span2 = detectContextualName('홍길동사본.pdf').find((s) => s.category === 'person_name');
    expect(span2?.text).toBe('홍길동');
  });

  it('detectContextualName: 동일 셀에 같은 이름 여러 번 등장 — 모두 매칭 (P1-3 회귀)', () => {
    const text = '7.성춘향-주민등록증사본_성춘향.pdf';
    const names = detectContextualName(text).filter((s) => s.category === 'person_name' && s.text === '성춘향');
    expect(names.length).toBeGreaterThanOrEqual(2);
  });
});

describe('detectContextualName (2자 이름 컨텍스트 매치)', () => {
  it('파일명 안 _박영. / _오성_ / _홍진. 매치', async () => {
    const { detectContextualName } = await import('./regex');
    // hintOnly cell은 사적 PII 컨텍스트로 확정됨 — 일반어 false positive(예: "신분증")가 함께
    // 잡혀도 어차피 셀 전체가 가려질 거라 over-match가 안전. 핵심 이름이 잡히는지만 검증.
    expect(detectContextualName('4.통장사본_박영.pdf').map((s) => s.text)).toContain('박영');
    expect(detectContextualName('12.오성_신분증_1.jpg').map((s) => s.text)).toContain('오성');
    expect(detectContextualName('19.신분증사본_홍진.png').map((s) => s.text)).toContain('홍진');
  });

  it('boundary 양쪽이 한글이면 미매치 (일반 단어 차단)', async () => {
    const { detectContextualName } = await import('./regex');
    // "이사회의" — 양쪽 한글로 둘러싸여 매치 X
    expect(detectContextualName('이사회의 결정사항').map((s) => s.text)).toEqual([]);
  });

  it('stoplist 일반 명사 차단 (이상/주요/도움/소속/연구)', async () => {
    const { detectContextualName } = await import('./regex');
    expect(detectContextualName('보고 이상 없음').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('항목 주요 사항').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('필요 도움 요청').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('국내 연구 동향').map((s) => s.text)).toEqual([]);
  });

  it('이름 끝글자가 명백한 조사면 차단 (이의/김의/박이)', async () => {
    const { detectContextualName } = await import('./regex');
    expect(detectContextualName('박의 의견').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('이를 보고').map((s) => s.text)).toEqual([]);
  });

  it('4자 이름 컨텍스트 매치 (김아무개_약력 / 남궁아무_이력서)', async () => {
    const { detectContextualName } = await import('./regex');
    expect(detectContextualName('6.김아무개_약력_202603.hwp').map((s) => s.text)).toContain(
      '김아무개',
    );
    expect(detectContextualName('남궁아무_이력서.pdf').map((s) => s.text)).toContain(
      '남궁아무',
    );
  });

  it('4자 일반 한자어 차단 (한국문화/연구개발/주요내용)', async () => {
    const { detectContextualName } = await import('./regex');
    expect(detectContextualName('_한국문화_').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('_연구개발_').map((s) => s.text)).toEqual([]);
    expect(detectContextualName('_주요내용_').map((s) => s.text)).toEqual([]);
  });
});

describe('NAME_WITH_TITLE 4자 이름 (title-context, hintOnly cell)', () => {
  it('단성+3자 + 직책 (김아무개 박사 / 정아무개 교수)', () => {
    expect(detectContextualName('김아무개 박사').find((s) => s.category === 'person_name')?.text)
      .toBe('김아무개');
  });

  it('복성+3자 + 직책 (남궁아무개 교수)', () => {
    expect(detectContextualName('남궁아무개 교수').find((s) => s.category === 'person_name')?.text)
      .toBe('남궁아무개');
  });
});
