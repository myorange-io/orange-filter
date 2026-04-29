// 합성 결산공시 데모 fixture — 사용자가 "예시 파일로 시험해보기" 클릭 시 즉석 생성되는
// HWPX가 round-trip 가능한 구조를 갖추고 있는지 검증.

import { describe, expect, test } from 'vitest';
import { parseHwpx } from './parsers/hwpx';
import { makeDemoHwpx } from './demo-fixture';

describe('makeDemoHwpx', () => {
  test('생성된 File은 application/hwp+zip MIME', async () => {
    const file = await makeDemoHwpx();
    expect(file.type).toBe('application/hwp+zip');
    expect(file.name).toBe('예시_결산공시.hwpx');
    expect(file.size).toBeGreaterThan(0);
  });

  test('parseHwpx로 다시 파싱되며 본문 + Preview/PrvText.txt segment 포함', async () => {
    const file = await makeDemoHwpx();
    const parsed = await parseHwpx(file);
    expect(parsed.segments.length).toBeGreaterThan(0);

    const ids = parsed.segments.map((s) => s.id);
    expect(ids.some((id) => id.startsWith('Contents/section0.xml'))).toBe(true);
    expect(ids.some((id) => id.startsWith('Preview/PrvText.txt'))).toBe(true);
  });

  test('합성 PII가 본문에 들어 있다 (휴대폰·RRN·이메일·계좌)', async () => {
    const file = await makeDemoHwpx();
    const parsed = await parseHwpx(file);
    const combined = parsed.combinedText;
    // 휴대폰
    expect(combined).toContain('010-1234-5678');
    // RRN
    expect(combined).toContain('900101-1234568');
    // 이메일
    expect(combined).toContain('contact@example.org');
    // 계좌
    expect(combined).toContain('신한 110-123-456789');
  });

  test('마스킹되면 안 되는 조직명·일반어가 데모에 함께 들어있다', async () => {
    const file = await makeDemoHwpx();
    const parsed = await parseHwpx(file);
    const combined = parsed.combinedText;
    expect(combined).toContain('한국사회적기업진흥원');
    expect(combined).toContain('선착순');
  });
});
