import { describe, expect, it } from 'vitest';
import {
  categoryForHeader,
  detectHeaderRow,
  findInlineLabels,
  isNameHintHeader,
  normalizeHeader,
} from './header-hints';

describe('normalizeHeader', () => {
  it('공백·특수문자 제거 + 소문자', () => {
    expect(normalizeHeader('E-mail')).toBe('email');
    expect(normalizeHeader('이 메일')).toBe('이메일');
    expect(normalizeHeader('H.P.')).toBe('hp');
    expect(normalizeHeader('성명 ')).toBe('성명');
    expect(normalizeHeader(' 계좌번호: ')).toBe('계좌번호');
  });
});

describe('categoryForHeader', () => {
  it('성명/이름 → person_name', () => {
    expect(categoryForHeader('성명')).toBe('person_name');
    expect(categoryForHeader('이름')).toBe('person_name');
    expect(categoryForHeader('담당자')).toBe('person_name');
    expect(categoryForHeader('Name')).toBe('person_name');
  });

  it('연락처/휴대폰/H.P. → mobile', () => {
    expect(categoryForHeader('휴대폰')).toBe('mobile');
    expect(categoryForHeader('휴대폰번호')).toBe('mobile');
    expect(categoryForHeader('HP')).toBe('mobile');
    expect(categoryForHeader('h.p.')).toBe('mobile');
  });

  it('전화 → landline', () => {
    expect(categoryForHeader('전화')).toBe('landline');
    expect(categoryForHeader('전화번호')).toBe('landline');
  });

  it('이메일/E-mail → email', () => {
    expect(categoryForHeader('이메일')).toBe('email');
    expect(categoryForHeader('E-mail')).toBe('email');
    expect(categoryForHeader('Email')).toBe('email');
  });

  it('계좌정보/계좌번호 → account', () => {
    expect(categoryForHeader('계좌정보')).toBe('account');
    expect(categoryForHeader('계좌번호')).toBe('account');
    expect(categoryForHeader('입금계좌')).toBe('account');
  });

  it('주민(등록)번호 → rrn', () => {
    expect(categoryForHeader('주민번호')).toBe('rrn');
    expect(categoryForHeader('주민등록번호')).toBe('rrn');
  });

  it('소속/기관/회사 → organization', () => {
    expect(categoryForHeader('소속')).toBe('organization');
    expect(categoryForHeader('기관명')).toBe('organization');
  });

  it('일반 단어/빈 문자열은 미매치', () => {
    expect(categoryForHeader('비고')).toBeUndefined();
    expect(categoryForHeader('번호')).toBeUndefined();
    expect(categoryForHeader('')).toBeUndefined();
    expect(categoryForHeader('no.')).toBeUndefined();
  });
});

describe('detectHeaderRow', () => {
  it('첫 행이 헤더인 표준 케이스', () => {
    const rows = [
      ['이름', '연락처', '이메일'],
      ['홍길동', '010-0', 'a@b.c'],
    ];
    const result = detectHeaderRow(rows);
    expect(result?.rowIndex).toBe(0);
    expect(result?.categoryByCol.get(0)).toBe('person_name');
    expect(result?.categoryByCol.get(1)).toBe('mobile');
    expect(result?.categoryByCol.get(2)).toBe('email');
  });

  it('첫 행이 메모/제목이고 두 번째 행이 헤더', () => {
    // 첫 행에 메모/제목이 있고 두 번째 행이 진짜 헤더인 NPO 양식 구조
    const rows = [
      ['4/3까지 1차 취합', '', '', ''],
      ['no.', '소속', '성명', '연락처'],
      ['1', '단체A', '홍길동', '010-0'],
    ];
    const result = detectHeaderRow(rows);
    expect(result?.rowIndex).toBe(1);
    expect(result?.categoryByCol.get(1)).toBe('organization');
    expect(result?.categoryByCol.get(2)).toBe('person_name');
    expect(result?.categoryByCol.get(3)).toBe('mobile');
  });

  it('헤더와 매치되는 셀이 0개면 undefined', () => {
    const rows = [
      ['x', 'y', 'z'],
      ['1', '2', '3'],
    ];
    expect(detectHeaderRow(rows)).toBeUndefined();
  });

  it('빈 행을 건너뛰며 매치 가장 많은 행 선택', () => {
    const rows = [
      ['', '', ''],
      ['이름', '비고', ''], // 1 match
      ['이름', '연락처', '이메일'], // 3 matches — 채택
    ];
    const result = detectHeaderRow(rows);
    expect(result?.rowIndex).toBe(2);
    expect(result?.categoryByCol.size).toBe(3);
  });
});

describe('isNameHintHeader', () => {
  it('첨부 파일 컬럼명 매치', () => {
    expect(isNameHintHeader('신분증')).toBe(true);
    expect(isNameHintHeader('통장사본')).toBe(true);
    expect(isNameHintHeader('이력서')).toBe(true);
    expect(isNameHintHeader('CV')).toBe(true);
    expect(isNameHintHeader('약력')).toBe(true);
  });

  it('일반 헤더는 미매치', () => {
    expect(isNameHintHeader('성명')).toBe(false);
    expect(isNameHintHeader('연락처')).toBe(false);
    expect(isNameHintHeader('비고')).toBe(false);
  });
});

describe('detectHeaderRow with nameHintCols', () => {
  it('forcedCategory + nameHint 컬럼 분리 반환', () => {
    const rows = [
      ['no.', '소속', '성명', '연락처', '비고', '신분증', '통장사본', '이력서'],
    ];
    const r = detectHeaderRow(rows);
    expect(r?.categoryByCol.get(1)).toBe('organization');
    expect(r?.categoryByCol.get(2)).toBe('person_name');
    expect(r?.categoryByCol.get(3)).toBe('mobile');
    expect(r?.nameHintCols.has(5)).toBe(true);
    expect(r?.nameHintCols.has(6)).toBe(true);
    expect(r?.nameHintCols.has(7)).toBe(true);
    // '비고'는 어떤 카테고리도 아님
    expect(r?.categoryByCol.has(4)).toBe(false);
    expect(r?.nameHintCols.has(4)).toBe(false);
  });
});

describe('findInlineLabels', () => {
  it('"성명: 조성도" 패턴 → person_name 카테고리, 값 영역 반환', () => {
    const text = '성명: 조성도';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.category).toBe('person_name');
    const value = text.slice(matches[0]!.valueStart, matches[0]!.valueEnd);
    expect(value).toBe('조성도');
  });

  it('여러 라벨이 줄바꿈으로 구분된 경우', () => {
    const text = '성명: 김민수\n연락처: 010-1234-5678\n이메일: foo@bar.com';
    const matches = findInlineLabels(text);
    expect(matches.map((m) => m.category)).toEqual([
      'person_name',
      'mobile',
      'email',
    ]);
    expect(text.slice(matches[1]!.valueStart, matches[1]!.valueEnd)).toBe(
      '010-1234-5678',
    );
  });

  it('파이프(`|`)로 구분된 셀 흐름도 분리', () => {
    const text = '성명: 김민수 | 연락처: 010-1234-5678';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(2);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd).trim()).toBe(
      '김민수',
    );
  });

  it('사전에 없는 라벨은 매치 안 함', () => {
    const text = '메모: 중요한 내용';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 값 경계 — 같은 줄에 라벨이 여럿일 때 (구분자 없이 공백만으로 이어지는 경우)
  // ---------------------------------------------------------------------------

  it('한 줄에 라벨이 여럿이면 다음 라벨 직전까지가 값', () => {
    const text = '성명: 김민수 연락처: 010-1234-5678';
    const matches = findInlineLabels(text);
    expect(matches.map((m) => m.category)).toEqual(['person_name', 'mobile']);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('김민수');
    expect(text.slice(matches[1]!.valueStart, matches[1]!.valueEnd)).toBe('010-1234-5678');
  });

  it('사전에 없는 라벨도 앞 값의 경계 역할은 한다', () => {
    const text = '성명: 김민수 메모: 중요한 내용';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('김민수');
  });

  it('값 우측 공백은 스팬에 포함하지 않는다', () => {
    const text = '성명: 김민수   \n이메일: a@b.com';
    const matches = findInlineLabels(text);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('김민수');
  });

  it('`#`·`№` 구분자도 인식', () => {
    const text = '여권번호# M12345678\n계좌№1002-100-100100';
    const matches = findInlineLabels(text);
    expect(matches.map((m) => m.category)).toEqual(['passport', 'account']);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('M12345678');
    expect(text.slice(matches[1]!.valueStart, matches[1]!.valueEnd)).toBe('1002-100-100100');
  });

  // ---------------------------------------------------------------------------
  // Tier B — 공백만으로 구분된 cue. ID 계열 + 숫자 포함 값에만 발화.
  // ---------------------------------------------------------------------------

  it('공백 구분자 + ID 카테고리 → 매치 (콜론 없는 양식)', () => {
    const text = '여권번호 M12345678';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.category).toBe('passport');
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('M12345678');
  });

  it('공백 구분자 값은 한글 앞에서 끊긴다', () => {
    const text = '사업자등록번호 123-45-67890 (주)오렌지';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('123-45-67890');
  });

  it('공백 구분자는 ID 계열이 아닌 카테고리에는 발화하지 않음', () => {
    // "대표 김철수" — person_name은 Tier B 대상이 아니다 (일반 문장과 구분 불가).
    expect(findInlineLabels('대표 김철수가 인사말을 했다')).toHaveLength(0);
    expect(findInlineLabels('주소 서울시 강남구')).toHaveLength(0);
  });

  it('공백 구분자 + 숫자 없는 값은 오탐으로 차단', () => {
    // "카드 3장"·"면허 2급"은 값 형태(≥4자 영숫자)에서 탈락,
    // "카드 abcd"는 숫자 없음에서 탈락.
    expect(findInlineLabels('카드 3장 발급')).toHaveLength(0);
    expect(findInlineLabels('면허 2급 소지')).toHaveLength(0);
    expect(findInlineLabels('카드 abcd')).toHaveLength(0);
  });

  it('credential은 숫자 없이도 단일 토큰이면 매치', () => {
    const text = '비밀번호 hunterpass';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.category).toBe('credential');
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('hunterpass');
  });

  it('Tier A 값 안에서 Tier B가 재발화하지 않음', () => {
    // "계좌: 우리 1002-100-100100" — Tier A가 값 전체를 claim했으므로
    // 그 안의 "우리 1002-..."를 Tier B가 다시 잡으면 중복 스팬이 된다.
    const text = '계좌: 우리 1002-100-100100';
    const matches = findInlineLabels(text);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0]!.valueStart, matches[0]!.valueEnd)).toBe('우리 1002-100-100100');
  });
});
