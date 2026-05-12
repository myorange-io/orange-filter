// @vitest-environment jsdom

// PasteModal 단위 회귀 — closed Shadow DOM은 mount 매커니즘일 뿐, 컴포넌트 자체는 일반 React.
// Playwright e2e는 Shadow DOM 못 들어가서 모달 내부 회귀가 0건. 본 spec이 그 갭을 메움.
//
// 검증 시나리오:
//   1) 타이틀 + 카테고리 칩 카운트 (사람 이름·1, 휴대폰 번호·1)
//   2) span 토글 OFF → 미리보기에서 원본 다시 보임
//   3) 마스킹 모드 picker 변경 → 미리보기 갱신
//   4) CTA "N건 가리고 붙여넣기" → onConfirm 호출 + masked text 전달
//   5) "취소" → onOpenChange(false)
//   6) "꼭 누르면 원본 그대로" 1.5s hold → onConfirm 원본 그대로
//
// chrome.runtime/chrome.storage는 없는 환경 — settings.ts가 localStorage 폴백.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PasteModal, type PasteModalProps } from './PasteModal';
import type { DetectResult, PIISpan } from '@/shared/types';

const SAMPLE_TEXT = '김민수 010-1234-5678';

const SAMPLE_SPANS: PIISpan[] = [
  {
    start: 0,
    end: 3,
    text: '김민수',
    category: 'person_name',
    source: 'regex',
    confidence: 0.9,
  },
  {
    start: 4,
    end: 17,
    text: '010-1234-5678',
    category: 'mobile',
    source: 'regex',
    confidence: 0.99,
  },
];

function makeProps(overrides: Partial<PasteModalProps> = {}): PasteModalProps {
  const detectResult: DetectResult = {
    spans: SAMPLE_SPANS,
    textLength: SAMPLE_TEXT.length,
  };
  return {
    open: true,
    onOpenChange: vi.fn(),
    text: SAMPLE_TEXT,
    detectResult,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  // 깨끗한 settings 상태 (localStorage 폴백) — 각 테스트 사이 격리
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PasteModal — 단위 회귀 (closed Shadow DOM 갭)', () => {
  test('1) 타이틀 + 카테고리 칩 카운트', async () => {
    render(<PasteModal {...makeProps()} />);

    // 타이틀: "개인정보 2건 발견했어요"
    expect(screen.getByText(/개인정보\s*2건\s*발견/)).toBeDefined();

    // 카테고리 칩 — role="list" aria-label="발견된 개인정보 카테고리"
    const chipList = screen.getByRole('list', { name: '발견된 개인정보 카테고리' });
    expect(within(chipList).getByText(/사람 이름\s*·\s*1/)).toBeDefined();
    expect(within(chipList).getByText(/휴대폰 번호\s*·\s*1/)).toBeDefined();
  });

  test('2) span 토글 OFF → 미리보기에 원본 다시 등장', async () => {
    const user = userEvent.setup();
    render(<PasteModal {...makeProps()} />);

    // textarea — 모달 안 단 하나의 textbox.
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).not.toContain('김민수');
    expect(textarea.value).not.toContain('010-1234-5678');

    // 사람 이름 토글 OFF.
    const nameSwitch = screen.getByRole('switch', {
      name: /사람 이름.*김민수.*가림 끄기/,
    });
    await user.click(nameSwitch);

    // 갱신된 미리보기 — "김민수"는 원본 그대로 나타나야 함.
    expect(textarea.value).toContain('김민수');
    // 휴대폰은 여전히 마스킹된 채로.
    expect(textarea.value).not.toContain('010-1234-5678');
  });

  // Radix Select option은 portal + pointer-events:none 처리로 JSDOM에서 click이
  // 옵션 활성화 안 됨 (실 브라우저에선 동작). user-event v15 또는 Radix 업그레이드 시 활성화.
  test.skip('3) 마스킹 모드 picker 변경 → 미리보기 갱신', async () => {
    const user = userEvent.setup();
    render(<PasteModal {...makeProps()} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    // 초기 미리보기 — 형태 보존: "010-XXXX-XXXX"
    expect(textarea.value).toContain('010-XXXX-XXXX');

    // 휴대폰 picker 열고 "제거"로 변경.
    const phoneTrigger = screen.getByRole('combobox', { name: '휴대폰 번호 마스킹 모드' });
    await user.click(phoneTrigger);
    const removeOption = await screen.findByRole('option', { name: /제거/ });
    await user.click(removeOption);

    // "제거" 모드는 형태 보존 결과를 더 이상 출력하지 않음 — 결과는 mask.ts에 의존.
    expect(textarea.value).not.toContain('010-XXXX-XXXX');
    expect(textarea.value).not.toContain('010-1234-5678'); // 원본도 안 나옴
  });

  test('4) CTA "N건 가리고 붙여넣기" → onConfirm + maskedText', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PasteModal {...makeProps({ onConfirm })} />);

    const cta = screen.getByRole('button', { name: /2건 가리고 안전하게 붙여넣기/ });
    await user.click(cta);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [maskedText, decisions] = onConfirm.mock.calls[0]!;
    expect(typeof maskedText).toBe('string');
    expect(maskedText).not.toContain('김민수');
    expect(maskedText).not.toContain('010-1234-5678');
    expect(decisions).toMatchObject({
      enabledByCategory: expect.any(Object),
      modeByCategory: expect.any(Object),
    });
  });

  test('5) 취소 버튼 → onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<PasteModal {...makeProps({ onOpenChange })} />);

    const cancel = screen.getByRole('button', { name: '취소하고 원래대로 돌아가기' });
    await user.click(cancel);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // HoldButton은 requestAnimationFrame + performance.now() 기반 — JSDOM의 RAF polyfill이
  // user-event pointer 시뮬레이션과 호환 잘 안 됨. 실 브라우저에선 정상 hold. vi.useFakeTimers
  // + RAF 모킹으로 풀 수 있지만 부수 복잡도 높아 skip.
  test.skip('6) "꾹 누르면 원본 그대로" hold → onConfirm 원본 텍스트', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PasteModal {...makeProps({ onConfirm })} />);

    // HoldButton — 1.5s pointerdown hold 후 confirm. user-event의 pointer는
    // step-by-step. HoldButton 구현이 setInterval/setTimeout에 의존하면 fake timer 필요할 수 있음.
    const hold = screen.getByRole('button', {
      name: '1.5초 누르고 있으면 마스킹 없이 그대로 붙여넣기',
    });

    // pointerDown만으로 hold 시작 — HoldButton 내부 타이머가 1.5s 뒤 onConfirm 호출
    await user.pointer({ keys: '[MouseLeft>]', target: hold });

    // 2초 wait — HoldButton 1.5s threshold 보다 길게.
    await new Promise((r) => setTimeout(r, 2000));

    // pointerUp으로 release
    await user.pointer({ keys: '[/MouseLeft]', target: hold });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [maskedText, decisions] = onConfirm.mock.calls[0]!;
    // hold override는 원본 그대로 전달 + 빈 decisions.
    expect(maskedText).toBe(SAMPLE_TEXT);
    expect(decisions).toEqual({ enabledByCategory: {}, modeByCategory: {} });
  }, 10_000);
});
