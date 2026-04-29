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
});
