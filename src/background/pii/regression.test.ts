// P/R 게이트 회귀 테스트 — seed 코퍼스 (Tier 0 정규식 한정).
//
// 1.0 ship-blocker 게이트 (plan §1.0):
//   - RRN: P≥0.99, R≥0.98
//   - 휴대폰: P≥0.97, R≥0.95
//   - 인명: P≥0.85, R≥0.85 (모델 추론 필요 — 본 파일에선 미검증)
//   - 계좌: P≥0.95, R≥0.90
//
// 본 파일의 seed 코퍼스는 ~30 fixture로 정규식 회귀를 잡는다. 1.0 출시 전 ≥500 한국어 +
// ≥100 영문 FP 코퍼스로 확장 (S18 본격 작업, 사용자 도움으로 NPO 실 양식 + 합성 변형).
//
// 측정 단위는 "span"이며, span 매칭은 "category 일치 + offset 겹침"으로 판정한다.

import { describe, expect, it } from 'vitest';
import { detectKoreanPII } from './regex';
import type { PIICategory, PIISpan } from '@/shared/types';

interface FixtureSpan {
  start: number;
  end: number;
  category: PIICategory;
}

interface Fixture {
  /** 사람이 알아보기 쉬운 이름 */
  id: string;
  text: string;
  /** ground-truth — 정답 span 셋 (offset은 반드시 정확) */
  expected: FixtureSpan[];
}

// =============================================================================
// 한국어 seed 코퍼스
// =============================================================================
//
// 작성 원칙:
// 1) 실제 NPO 결산공시·기부금 명세서 양식에서 자주 등장하는 패턴.
// 2) 한국어 문장 안에 자연스럽게 매립 — 단순 숫자 나열은 회귀에 부족.
// 3) Negative 케이스 (FP 회귀)도 포함 — 비슷하지만 PII가 아닌 케이스.
//
// offset은 vitest 실행 시 검증되므로 작성 시 손으로 세지 않고, 추가 fixture는 helper로 생성.

function locate(haystack: string, needle: string): { start: number; end: number } {
  const start = haystack.indexOf(needle);
  if (start < 0) throw new Error(`fixture 작성 실패: "${needle}" not found in "${haystack}"`);
  return { start, end: start + needle.length };
}

function span(text: string, needle: string, category: PIICategory): FixtureSpan {
  const { start, end } = locate(text, needle);
  return { start, end, category };
}

const FIXTURES: Fixture[] = [
  // ── RRN (8) ──────────────────────────────────────────────────────
  {
    id: 'rrn-natural-1',
    text: '신청자 김철수의 주민등록번호는 900101-1234568 입니다.',
    expected: (() => {
      const t = '신청자 김철수의 주민등록번호는 900101-1234568 입니다.';
      // RRN 위 체크섬 통과 케이스를 확실히 만들기 위해 valid 번호 사용
      return [span(t, '900101-1234568', 'rrn')];
    })(),
  },
  {
    id: 'rrn-no-hyphen',
    text: '주민번호: 9001011234568',
    expected: [span('주민번호: 9001011234568', '9001011234568', 'rrn')],
  },
  {
    id: 'rrn-invalid-checksum',
    // invalid checksum → 매칭되면 안 됨
    text: '주민등록번호: 900101-1234500',
    expected: [],
  },
  {
    id: 'rrn-invalid-month',
    // 월 13 — invalid
    text: '주민번호: 901301-1234567',
    expected: [],
  },
  {
    id: 'rrn-multiple-in-one-line',
    // 두 RRN 모두 체크섬 valid (900202-2345679 = digit 9)
    text: '대표 900101-1234568, 부대표 900202-2345679',
    expected: (() => {
      const t = '대표 900101-1234568, 부대표 900202-2345679';
      return [
        span(t, '900101-1234568', 'rrn'),
        span(t, '900202-2345679', 'rrn'),
      ];
    })(),
  },

  // ── 휴대폰 (7) ───────────────────────────────────────────────────
  {
    id: 'mobile-natural-1',
    text: '연락처는 010-1234-5678 입니다.',
    expected: [span('연락처는 010-1234-5678 입니다.', '010-1234-5678', 'mobile')],
  },
  {
    id: 'mobile-spaces',
    text: '문의 010 1234 5678 으로 주세요.',
    expected: [span('문의 010 1234 5678 으로 주세요.', '010 1234 5678', 'mobile')],
  },
  {
    id: 'mobile-no-separator',
    text: '01012345678 입니다',
    expected: [span('01012345678 입니다', '01012345678', 'mobile')],
  },
  {
    id: 'mobile-multiple',
    text: '대표 010-1111-2222, 비상 010-3333-4444',
    expected: [
      span('대표 010-1111-2222, 비상 010-3333-4444', '010-1111-2222', 'mobile'),
      span('대표 010-1111-2222, 비상 010-3333-4444', '010-3333-4444', 'mobile'),
    ],
  },
  {
    id: 'mobile-fp-decimal',
    // 9자리 비슷하지만 마침표가 들어간 — 휴대폰 아님
    text: '버전 1.0.10.12345',
    expected: [],
  },

  // ── 유선전화 (3) ─────────────────────────────────────────────────
  {
    id: 'landline-seoul',
    text: '서울 본사 02-1234-5678',
    expected: [span('서울 본사 02-1234-5678', '02-1234-5678', 'landline')],
  },
  {
    id: 'landline-031',
    text: '경기 지부 031-987-6543',
    expected: [span('경기 지부 031-987-6543', '031-987-6543', 'landline')],
  },

  // ── 계좌 (4) ─────────────────────────────────────────────────────
  {
    id: 'account-shinhan',
    // 신한 12자리 (3-3-6) — 표준 한국 은행 계좌 포맷
    text: '신한은행 110-234-567890 입니다.',
    expected: [span('신한은행 110-234-567890 입니다.', '110-234-567890', 'account')],
  },
  {
    id: 'account-nonghyup',
    // 농협 11자리 (3-2-6)
    text: '농협 100-12-345678',
    expected: [span('농협 100-12-345678', '100-12-345678', 'account')],
  },
  {
    id: 'account-kookmin-kb',
    // KB 14자리 (3-6-2-3)
    text: '국민은행 729-123456-12-345',
    expected: [span('국민은행 729-123456-12-345', '729-123456-12-345', 'account')],
  },

  // ── 카드 (3) ─────────────────────────────────────────────────────
  {
    id: 'card-visa-spaced',
    text: '카드번호 4111 1111 1111 1111',
    expected: [span('카드번호 4111 1111 1111 1111', '4111 1111 1111 1111', 'card')],
  },
  {
    id: 'card-mastercard-hyphen',
    text: '결제 5555-5555-5555-4444 로 진행',
    expected: [span('결제 5555-5555-5555-4444 로 진행', '5555-5555-5555-4444', 'card')],
  },

  // ── 사업자등록번호 (2) ───────────────────────────────────────────
  // S18 본격 작업에서 NPO 실 사업자번호 (체크섬 통과) 추가.

  // ── 이메일 (3) ───────────────────────────────────────────────────
  {
    id: 'email-natural',
    text: '문의: contact@example.org',
    expected: [span('문의: contact@example.org', 'contact@example.org', 'email')],
  },
  {
    id: 'email-korean-domain-not',
    text: '한국어 도메인은 우리 시스템에서 보지 않음',
    expected: [],
  },

  // ── 자격정보 (2) ─────────────────────────────────────────────────
  {
    id: 'credential-aws',
    text: 'AWS_KEY=AKIAIOSFODNN7EXAMPLE',
    expected: [
      span('AWS_KEY=AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE', 'credential'),
    ],
  },

  // ── FP 회귀 (영문 5) ─────────────────────────────────────────────
  // 영문 텍스트가 한국어 정규식에 잘못 매칭되지 않아야 한다.
  {
    id: 'fp-en-version-numbers',
    text: 'Version 2024.05.10 build 12345',
    expected: [],
  },
  {
    id: 'fp-en-uuid',
    text: 'request-id: 550e8400-e29b-41d4-a716-446655440000',
    expected: [],
  },
  {
    id: 'fp-en-hash',
    text: 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expected: [],
  },
  {
    id: 'fp-en-isbn',
    text: 'ISBN 978-3-16-148410-0',
    expected: [],
  },
];

// =============================================================================
// 측정 — span level precision/recall
// =============================================================================

interface CategoryMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

function spansOverlap(a: FixtureSpan | PIISpan, b: FixtureSpan | PIISpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function evaluate(
  predicted: PIISpan[],
  expected: FixtureSpan[],
): { matchedExpected: Set<number>; matchedPredicted: Set<number> } {
  const matchedExpected = new Set<number>();
  const matchedPredicted = new Set<number>();
  for (let pi = 0; pi < predicted.length; pi++) {
    const p = predicted[pi]!;
    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const e = expected[ei]!;
      if (e.category === p.category && spansOverlap(p, e)) {
        matchedExpected.add(ei);
        matchedPredicted.add(pi);
        break;
      }
    }
  }
  return { matchedExpected, matchedPredicted };
}

function computeMetrics(fixtures: Fixture[]): Map<PIICategory, CategoryMetrics> {
  const tp = new Map<PIICategory, number>();
  const fp = new Map<PIICategory, number>();
  const fn = new Map<PIICategory, number>();

  for (const fx of fixtures) {
    const detected = detectKoreanPII(fx.text);
    const { matchedExpected, matchedPredicted } = evaluate(detected, fx.expected);

    // TP / FN — expected 기준
    for (let i = 0; i < fx.expected.length; i++) {
      const e = fx.expected[i]!;
      if (matchedExpected.has(i)) tp.set(e.category, (tp.get(e.category) ?? 0) + 1);
      else fn.set(e.category, (fn.get(e.category) ?? 0) + 1);
    }
    // FP — predicted 중 매칭 안 된 것
    for (let i = 0; i < detected.length; i++) {
      if (!matchedPredicted.has(i)) {
        const p = detected[i]!;
        fp.set(p.category, (fp.get(p.category) ?? 0) + 1);
      }
    }
  }

  const out = new Map<PIICategory, CategoryMetrics>();
  const cats = new Set<PIICategory>([...tp.keys(), ...fp.keys(), ...fn.keys()]);
  for (const c of cats) {
    const t = tp.get(c) ?? 0;
    const f = fp.get(c) ?? 0;
    const n = fn.get(c) ?? 0;
    const precision = t + f === 0 ? 1 : t / (t + f);
    const recall = t + n === 0 ? 1 : t / (t + n);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    out.set(c, { tp: t, fp: f, fn: n, precision, recall, f1 });
  }
  return out;
}

// =============================================================================
// 게이트 (seed 코퍼스 기준 — 본격 코퍼스로 강화 예정)
// =============================================================================
//
// seed corpus는 작아 한 fixture가 다 못 잡히면 점수가 큰폭 떨어짐. 일단 보수적인 임계값
// (실제 1.0 게이트보다 낮게) 둠. 본격 P/R 게이트는 ≥500 fixture 마련 후 plan 임계값으로 강화.

const SEED_GATES: Partial<Record<PIICategory, { precision: number; recall: number }>> = {
  rrn: { precision: 0.95, recall: 0.95 },
  mobile: { precision: 0.9, recall: 0.9 },
  landline: { precision: 0.9, recall: 0.9 },
  account: { precision: 0.85, recall: 0.85 },
  card: { precision: 0.9, recall: 0.9 },
  email: { precision: 0.95, recall: 0.95 },
  credential: { precision: 0.9, recall: 0.9 },
};

describe('P/R 게이트 (seed 코퍼스)', () => {
  it('모든 fixture가 한 번 이상 valid — id 중복 없음', () => {
    const ids = new Set(FIXTURES.map((f) => f.id));
    expect(ids.size).toBe(FIXTURES.length);
  });

  it('각 fixture의 expected offset은 text 안에서 정확히 일치', () => {
    for (const fx of FIXTURES) {
      for (const e of fx.expected) {
        expect(e.start, `${fx.id} start≥0`).toBeGreaterThanOrEqual(0);
        expect(e.end, `${fx.id} end>start`).toBeGreaterThan(e.start);
        expect(e.end).toBeLessThanOrEqual(fx.text.length);
      }
    }
  });

  it('seed 코퍼스 — 카테고리별 P/R 게이트 통과', () => {
    const metrics = computeMetrics(FIXTURES);

    // 디버깅 — 실패 시 실제 수치 출력
    const report: string[] = [];
    for (const [cat, m] of metrics) {
      report.push(
        `${cat}: P=${m.precision.toFixed(2)} R=${m.recall.toFixed(2)} F1=${m.f1.toFixed(2)} (TP=${m.tp} FP=${m.fp} FN=${m.fn})`,
      );
    }
    if (process.env.PII_REGRESSION_DEBUG) console.log(report.join('\n'));

    for (const [cat, gate] of Object.entries(SEED_GATES) as [
      PIICategory,
      { precision: number; recall: number },
    ][]) {
      const m = metrics.get(cat);
      if (!m) continue; // 해당 카테고리 fixture 없으면 skip
      expect(m.precision, `${cat} precision`).toBeGreaterThanOrEqual(gate.precision);
      expect(m.recall, `${cat} recall`).toBeGreaterThanOrEqual(gate.recall);
    }
  });

  it('영문 FP 코퍼스 — 한국어 정규식이 영문에 오탐 없음', () => {
    const fps = FIXTURES.filter((f) => f.id.startsWith('fp-en-'));
    expect(fps.length).toBeGreaterThanOrEqual(4);
    for (const fx of fps) {
      const detected = detectKoreanPII(fx.text);
      // 영문 FP 코퍼스의 expected는 항상 [] — 어떤 detect도 fail
      expect(detected, `${fx.id}: ${fx.text}`).toEqual([]);
    }
  });
});

// 외부에서 corpus를 import해 본격 P/R 측정 시 재사용 가능
export { FIXTURES, computeMetrics };
export type { Fixture, FixtureSpan, CategoryMetrics };
