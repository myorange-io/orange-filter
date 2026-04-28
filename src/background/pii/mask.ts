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
    case 'landline': {
      // 캐리어/지역번호 prefix만 보존, 가운데·뒤는 모두 X.
      // 010-1234-5678 → 010-XXXX-XXXX, 02-123-4567 → 02-XXX-XXXX
      let firstGroupKept = false;
      return text.replace(/\d+/g, (group) => {
        if (!firstGroupKept) {
          firstGroupKept = true;
          return group;
        }
        return 'X'.repeat(group.length);
      });
    }
    case 'driver_license': {
      // AA-BB-CCCCCC-DD → AA-BB-XXXXXX-XX (지역·발급연도만 보존)
      const m = /^(\d{2})-(\d{2})-(\d{6})-(\d{2})$/.exec(text);
      if (m) return `${m[1]}-${m[2]}-XXXXXX-XX`;
      return text.replace(/\d/g, 'X');
    }
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
    case 'corporate_registration': {
      // 6-7자리: 앞 6자리(분류)만 보존, 일련번호 7자리 마스킹.
      const m = /^(\d{6})-(\d{7})$/.exec(text);
      if (m) return `${m[1]}-XXXXXXX`;
      return text.replace(/\d/g, 'X');
    }
    case 'passport':
      // 첫 글자 보존 + 나머지 X
      return text[0] + 'X'.repeat(Math.max(0, text.length - 1));
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

// 한국어 사용자 친화 태그. 영어 약어보다 paste 결과를 사람이 읽고 검토할 때 명확.
const TAG_BY_CATEGORY: Record<PIICategory, string> = {
  rrn: '[주민등록번호]',
  foreign_registration: '[외국인등록번호]',
  driver_license: '[운전면허번호]',
  passport: '[여권번호]',
  credential: '[비밀키]',
  card: '[카드번호]',
  business_number: '[사업자등록번호]',
  corporate_registration: '[법인등록번호]',
  account: '[계좌번호]',
  mobile: '[휴대폰]',
  landline: '[유선전화]',
  email: '[이메일]',
  person_name: '[이름]',
  address: '[주소]',
  organization: '[조직명]',
  url: '[URL]',
  date: '[날짜]',
};

// =============================================================================
// 가짜 데이터 (placeholder)
// =============================================================================

const FAKE_BY_CATEGORY: Record<PIICategory, string> = {
  rrn: '900101-1234567',
  foreign_registration: '900101-5234567',
  driver_license: '11-00-000000-00',
  passport: 'M00000000',
  card: '4111-1111-1111-1111',
  account: '123-45-678901',
  mobile: '010-0000-0000',
  landline: '02-000-0000',
  email: 'redacted@example.com',
  business_number: '000-00-00000',
  corporate_registration: '000000-0000000',
  person_name: '홍길동',
  address: '서울특별시 ○○구 ○○동',
  organization: '○○단체',
  url: 'https://example.com',
  date: '0000-00-00',
  credential: 'sk-redacted-credential-placeholder',
};

// =============================================================================
// 카테고리별 샘플 (드롭다운 예시 표시용)
// =============================================================================

const SAMPLE_BY_CATEGORY: Record<PIICategory, string> = {
  rrn: '900101-1234568',
  foreign_registration: '850515-5234560',
  driver_license: '11-25-123456-78',
  mobile: '010-1234-5678',
  landline: '02-1234-5678',
  account: '110-234-567890',
  card: '4111 1111 1111 1111',
  business_number: '120-86-12347',
  corporate_registration: '130111-0006246',
  passport: 'M12345678',
  person_name: '홍길동',
  email: 'minsu@example.com',
  address: '서울특별시 강남구',
  url: 'https://example.com',
  date: '1985-03-12',
  credential: 'sk-abc1234567890',
  organization: '○○재단',
};

/**
 * 사용자에게 마스킹 모드의 결과를 미리 보여주기 위한 카테고리별 샘플 변환.
 * 드롭다운 옵션 옆에 회색 부기로 표시.
 */
export function getMaskExample(category: PIICategory, mode: MaskMode): string {
  const sample = SAMPLE_BY_CATEGORY[category];
  if (mode === 'remove') return '(삭제)';
  return applyMask(
    {
      start: 0,
      end: sample.length,
      text: sample,
      category,
      confidence: 1,
      source: 'regex',
    },
    mode,
  );
}

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
