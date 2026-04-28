import type { MaskMode, PIICategory, PIISpan } from '@/shared/types';

// =============================================================================
// 카테고리별 shape (형태 보존) 마스킹
// =============================================================================

function maskDigitsKeepingLast(text: string, keepLast: number): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= keepLast) return text.replace(/\d/g, 'X');
  let masked = 0;
  const out: string[] = [];
  // 뒤에서부터 keepLast개 숫자는 보존, 나머지는 X
  const reversed = [...text].reverse();
  for (const ch of reversed) {
    if (/\d/.test(ch)) {
      if (masked < keepLast) {
        out.push(ch);
        masked++;
      } else {
        out.push('X');
      }
    } else {
      out.push(ch);
    }
  }
  return out.reverse().join('');
}

function maskShape(text: string, category: PIICategory): string {
  switch (category) {
    case 'rrn':
    case 'foreign_registration': {
      // 앞 6자리 보존 + XXXXXXX
      const m = /^(\d{6})[-\s]?(\d{7})$/.exec(text);
      if (m) return `${m[1]}-XXXXXXX`;
      return text.replace(/\d/g, 'X');
    }
    case 'mobile':
    case 'landline':
      // 끝 4자리 마스킹 (앞부분 보존)
      return text
        .split('')
        .map((ch, i, arr) => {
          if (!/\d/.test(ch)) return ch;
          // 뒤에서부터 4번째 이내의 숫자만 마스킹
          let trailing = 0;
          for (let j = arr.length - 1; j > i; j--) {
            if (/\d/.test(arr[j]!)) trailing++;
          }
          return trailing < 4 ? 'X' : ch;
        })
        .join('');
    case 'phone_international':
      // 국가코드 + 마지막 4자리 보존, 나머지 마스킹
      return maskDigitsKeepingLast(text, 4);
    case 'card': {
      // 4-4-4-4: 앞 4 + 뒤 4 보존
      const m = /^(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})$/.exec(text);
      if (m) return `${m[1]}-XXXX-XXXX-${m[4]}`;
      return text.replace(/\d/g, 'X');
    }
    case 'account':
      // 가운데 마스킹, 앞 3 + 뒤 3 보존
      return text
        .split('')
        .map((ch, i, arr) => {
          if (!/\d/.test(ch)) return ch;
          let leading = 0;
          for (let j = 0; j < i; j++) if (/\d/.test(arr[j]!)) leading++;
          let trailing = 0;
          for (let j = arr.length - 1; j > i; j--) if (/\d/.test(arr[j]!)) trailing++;
          return leading >= 3 && trailing >= 3 ? 'X' : ch;
        })
        .join('');
    case 'email': {
      const m = /^([^@])([^@]*)(@.+)$/.exec(text);
      if (m) {
        const stars = '*'.repeat(Math.max(2, m[2]!.length));
        return `${m[1]}${stars}${m[3]}`;
      }
      return text;
    }
    case 'business_number': {
      const m = /^(\d{3})[-\s]?(\d{2})[-\s]?(\d{5})$/.exec(text);
      if (m) return `${m[1]}-${m[2]}-XXXXX`;
      return text.replace(/\d/g, 'X');
    }
    case 'passport':
      // 첫 글자 보존 + 나머지 X
      return text[0] + 'X'.repeat(Math.max(0, text.length - 1));
    case 'ssn_us': {
      const m = /^(\d{3})-(\d{2})-(\d{4})$/.exec(text);
      if (m) return `XXX-XX-${m[3]}`;
      return text.replace(/\d/g, 'X');
    }
    case 'person_name':
    case 'organization':
    case 'address':
    case 'date':
    case 'url':
      return '●'.repeat(Math.max(2, [...text].length));
    case 'credential':
      // 시크릿은 형태 보존도 위험 — 길이만 보존
      return '●'.repeat(Math.min(text.length, 16));
  }
}

// =============================================================================
// 태그 치환
// =============================================================================

const TAG_BY_CATEGORY: Record<PIICategory, string> = {
  rrn: '[RRN]',
  foreign_registration: '[FRN]',
  passport: '[PASSPORT]',
  ssn_us: '[SSN]',
  credential: '[CREDENTIAL]',
  card: '[CARD]',
  business_number: '[BIZ_NO]',
  account: '[ACCOUNT]',
  mobile: '[PHONE]',
  landline: '[PHONE]',
  phone_international: '[PHONE]',
  email: '[EMAIL]',
  person_name: '[NAME]',
  address: '[ADDRESS]',
  organization: '[ORG]',
  url: '[URL]',
  date: '[DATE]',
};

// =============================================================================
// 가짜 데이터 (placeholder)
// =============================================================================

const FAKE_BY_CATEGORY: Record<PIICategory, string> = {
  rrn: '900101-1234567',
  foreign_registration: '900101-5234567',
  passport: 'M00000000',
  ssn_us: '123-45-6789',
  card: '4111-1111-1111-1111',
  account: '123-45-678901',
  mobile: '010-0000-0000',
  landline: '02-000-0000',
  phone_international: '+00-00-0000-0000',
  email: 'redacted@example.com',
  business_number: '000-00-00000',
  person_name: '홍길동',
  address: '서울특별시 ○○구 ○○동',
  organization: '○○단체',
  url: 'https://example.com',
  date: '0000-00-00',
  credential: 'sk-redacted-credential-placeholder',
};

// =============================================================================
// 단일 스팬 마스킹
// =============================================================================

export function applyMask(span: PIISpan, mode: MaskMode): string {
  switch (mode) {
    case 'shape':
      return maskShape(span.text, span.category);
    case 'tag':
      return TAG_BY_CATEGORY[span.category];
    case 'fake':
      return FAKE_BY_CATEGORY[span.category];
    case 'remove':
      return '';
  }
}

// =============================================================================
// 텍스트 전체 마스킹
// =============================================================================

export interface MaskOptions {
  /** 카테고리별 마스킹 모드. 미지정 시 defaultMode 또는 'shape' */
  modeByCategory?: Partial<Record<PIICategory, MaskMode>>;
  /** 모든 카테고리 일괄 모드 (modeByCategory 우선) */
  defaultMode?: MaskMode;
  /** 카테고리별 ON/OFF — false면 마스킹 건너뜀 */
  enabledByCategory?: Partial<Record<PIICategory, boolean>>;
  /** 개별 스팬 ID 단위 ON/OFF (사용자가 미리보기에서 토글) */
  enabledSpanKeys?: ReadonlySet<string>;
}

export interface MaskResult {
  text: string;
  applied: PIISpan[];
  skipped: PIISpan[];
}

function spanKey(span: PIISpan): string {
  return `${span.start}:${span.end}:${span.category}`;
}

export function maskText(
  text: string,
  spans: ReadonlyArray<PIISpan>,
  options: MaskOptions = {},
): MaskResult {
  const sorted = [...spans].sort((a, b) => a.start - b.start);

  // 안전장치: 겹치는 스팬 제거 (호출자가 이미 dedupe했어도 한 번 더)
  const nonOverlapping: PIISpan[] = [];
  for (const span of sorted) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (last && span.start < last.end) continue;
    nonOverlapping.push(span);
  }

  const applied: PIISpan[] = [];
  const skipped: PIISpan[] = [];
  const out: string[] = [];
  let cursor = 0;

  for (const span of nonOverlapping) {
    const categoryEnabled =
      options.enabledByCategory?.[span.category] ?? true;
    const spanEnabled =
      options.enabledSpanKeys === undefined ||
      options.enabledSpanKeys.has(spanKey(span));
    if (!categoryEnabled || !spanEnabled) {
      skipped.push(span);
      continue;
    }
    const mode =
      options.modeByCategory?.[span.category] ??
      options.defaultMode ??
      'shape';
    out.push(text.slice(cursor, span.start));
    out.push(applyMask(span, mode));
    cursor = span.end;
    applied.push(span);
  }
  out.push(text.slice(cursor));

  return { text: out.join(''), applied, skipped };
}
