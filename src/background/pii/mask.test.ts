import { describe, expect, it } from 'vitest';
import type { PIISpan } from '@/shared/types';
import { applyMask, maskText } from './mask';

function span(
  text: string,
  category: PIISpan['category'],
  start = 0,
): PIISpan {
  return {
    start,
    end: start + text.length,
    text,
    category,
    confidence: 0.95,
    source: 'regex',
  };
}

// =============================================================================
// applyMask — 카테고리별 shape 검증
// =============================================================================

describe('applyMask shape mode', () => {
  it('RRN: 앞 6자리 보존 + 뒤 7자리 X', () => {
    expect(applyMask(span('950510-1234567', 'rrn'), 'shape')).toBe(
      '950510-XXXXXXX',
    );
  });

  it('휴대폰: 캐리어 prefix만 보존, 가운데·뒤 X', () => {
    expect(applyMask(span('010-1234-5678', 'mobile'), 'shape')).toBe(
      '010-XXXX-XXXX',
    );
  });

  it('유선전화: 지역번호만 보존, 나머지 X', () => {
    expect(applyMask(span('02-123-4567', 'landline'), 'shape')).toBe(
      '02-XXX-XXXX',
    );
    expect(applyMask(span('031-1234-5678', 'landline'), 'shape')).toBe(
      '031-XXXX-XXXX',
    );
  });

  it('카드: 가운데 8자리 X, 앞뒤 4자리 보존', () => {
    expect(applyMask(span('4242-4242-4242-4242', 'card'), 'shape')).toBe(
      '4242-XXXX-XXXX-4242',
    );
  });

  it('이메일: 첫 글자 + @+도메인 보존, 나머지 *', () => {
    const result = applyMask(span('contact@example.org', 'email'), 'shape');
    expect(result.startsWith('c')).toBe(true);
    expect(result.endsWith('@example.org')).toBe(true);
    expect(result).toMatch(/^c\*+@example\.org$/);
  });

  it('SSN: 마지막 4자리만 보존', () => {
    expect(applyMask(span('123-45-6789', 'ssn_us'), 'shape')).toBe(
      'XXX-XX-6789',
    );
  });

  it('여권: 첫 글자 보존', () => {
    expect(applyMask(span('M12345678', 'passport'), 'shape')).toBe('MXXXXXXXX');
  });

  it('사업자번호: 마지막 5자리만 X', () => {
    expect(applyMask(span('120-86-12347', 'business_number'), 'shape')).toBe(
      '120-86-XXXXX',
    );
  });

  it('credential: 길이만 보존하는 ● 시퀀스 (시크릿은 형태도 위험)', () => {
    const result = applyMask(
      span('sk-abcdef0123456789', 'credential'),
      'shape',
    );
    expect(result).toMatch(/^●+$/);
  });

  it('인명: ● 시퀀스', () => {
    const result = applyMask(span('홍길동', 'person_name'), 'shape');
    expect(result).toMatch(/^●+$/);
  });

  it('국제전화: 마지막 4자리 보존', () => {
    const result = applyMask(
      span('+82-10-1234-5678', 'phone_international'),
      'shape',
    );
    expect(result.endsWith('5678')).toBe(true);
    expect(result.startsWith('+')).toBe(true);
  });
});

describe('applyMask tag mode', () => {
  it('RRN tag', () => {
    expect(applyMask(span('950510-1234567', 'rrn'), 'tag')).toBe('[RRN]');
  });

  it('mobile/landline/international 모두 [PHONE]으로 통일', () => {
    expect(applyMask(span('010-1234-5678', 'mobile'), 'tag')).toBe('[PHONE]');
    expect(applyMask(span('02-123-4567', 'landline'), 'tag')).toBe('[PHONE]');
    expect(applyMask(span('+1 555 1234', 'phone_international'), 'tag')).toBe(
      '[PHONE]',
    );
  });

  it('credential은 [CREDENTIAL]', () => {
    expect(applyMask(span('sk-x', 'credential'), 'tag')).toBe('[CREDENTIAL]');
  });
});

describe('applyMask fake mode', () => {
  it('카테고리별 placeholder', () => {
    expect(applyMask(span('any', 'rrn'), 'fake')).toBe('900101-1234567');
    expect(applyMask(span('any', 'person_name'), 'fake')).toBe('홍길동');
    expect(applyMask(span('any', 'email'), 'fake')).toBe('redacted@example.com');
  });
});

describe('applyMask remove mode', () => {
  it('모든 카테고리 빈 문자열', () => {
    expect(applyMask(span('any', 'rrn'), 'remove')).toBe('');
    expect(applyMask(span('any', 'person_name'), 'remove')).toBe('');
  });
});

// =============================================================================
// maskText — 텍스트 전체 처리
// =============================================================================

describe('maskText', () => {
  it('스팬이 없으면 원본 그대로', () => {
    const text = '평범한 문장입니다.';
    expect(maskText(text, []).text).toBe(text);
  });

  it('단일 스팬을 shape 기본 모드로 치환', () => {
    const text = '주민번호는 950510-1234567 입니다.';
    const spans: PIISpan[] = [span('950510-1234567', 'rrn', 6)];
    expect(maskText(text, spans).text).toBe(
      '주민번호는 950510-XXXXXXX 입니다.',
    );
  });

  it('여러 스팬을 위치 순으로 치환', () => {
    const text = '연락 010-1234-5678 또는 a@b.com';
    const spans: PIISpan[] = [
      span('010-1234-5678', 'mobile', 3),
      span('a@b.com', 'email', 21),
    ];
    const result = maskText(text, spans).text;
    expect(result).toContain('010-XXXX-XXXX');
    expect(result).toContain('@b.com');
    expect(result).not.toContain('010-1234-5678');
  });

  it('카테고리별 mode 다르게 적용', () => {
    const text = 'a@b.com 그리고 950510-1234567';
    const spans: PIISpan[] = [
      span('a@b.com', 'email', 0),
      span('950510-1234567', 'rrn', 12),
    ];
    const result = maskText(text, spans, {
      modeByCategory: { email: 'tag', rrn: 'fake' },
    }).text;
    expect(result).toBe('[EMAIL] 그리고 900101-1234567');
  });

  it('defaultMode가 modeByCategory의 fallback', () => {
    const text = '카드 4242-4242-4242-4242';
    const spans: PIISpan[] = [span('4242-4242-4242-4242', 'card', 3)];
    const result = maskText(text, spans, { defaultMode: 'tag' }).text;
    expect(result).toBe('카드 [CARD]');
  });

  it('enabledByCategory: 비활성 카테고리는 건드리지 않음', () => {
    const text = '주민 950510-1234567 메일 a@b.com';
    const spans: PIISpan[] = [
      span('950510-1234567', 'rrn', 3),
      span('a@b.com', 'email', 21),
    ];
    const result = maskText(text, spans, {
      enabledByCategory: { email: false },
    });
    expect(result.text).toContain('a@b.com'); // 그대로
    expect(result.text).toContain('950510-XXXXXXX');
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.category).toBe('email');
  });

  it('enabledSpanKeys: 사용자가 개별 스팬 토글 OFF', () => {
    const text = '950510-1234567';
    const spans: PIISpan[] = [span('950510-1234567', 'rrn', 0)];
    const result = maskText(text, spans, {
      enabledSpanKeys: new Set([]), // 비어 있으면 모두 skip
    });
    expect(result.text).toBe(text);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('remove 모드: 영역 자체가 사라짐', () => {
    const text = '여기 950510-1234567 끝';
    const spans: PIISpan[] = [span('950510-1234567', 'rrn', 3)];
    const result = maskText(text, spans, { defaultMode: 'remove' }).text;
    expect(result).toBe('여기  끝');
  });

  it('겹치는 스팬은 안전장치로 첫 번째만 적용', () => {
    const text = '4242-4242-4242-4242';
    const spans: PIISpan[] = [
      span('4242-4242-4242-4242', 'card', 0),
      span('4242', 'account', 0), // 겹침
    ];
    const result = maskText(text, spans);
    expect(result.applied).toHaveLength(1);
    expect(result.text).toBe('4242-XXXX-XXXX-4242');
  });

  it('정렬되지 않은 스팬도 위치 순으로 처리', () => {
    const text = 'a@b.com 그리고 c@d.com';
    const cIdx = text.indexOf('c@d.com');
    const spans: PIISpan[] = [
      span('c@d.com', 'email', cIdx),
      span('a@b.com', 'email', 0),
    ];
    const result = maskText(text, spans, { defaultMode: 'tag' }).text;
    expect(result).toBe('[EMAIL] 그리고 [EMAIL]');
  });
});
