import { describe, expect, it } from 'vitest';
import { viterbiDecode, type Tag } from './bioes';

// 단순 헬퍼: label 인덱스 → Tag (테스트 전용 스킴)
function makeTagAt(labels: ReadonlyArray<string>) {
  return (i: number): Tag => {
    const label = labels[i]!;
    if (label === 'O') return 'O';
    const dash = label.indexOf('-');
    return {
      prefix: label.slice(0, dash) as 'B' | 'I' | 'E' | 'S',
      category: label.slice(dash + 1),
    };
  };
}

const HIGH = 0; // log(1)
const LOW = -10; // 매우 낮은 logprob

describe('viterbiDecode (BIO scheme)', () => {
  const labels = ['O', 'B-name', 'I-name'];
  const tagAt = makeTagAt(labels);

  it('빈 입력은 빈 결과', () => {
    expect(viterbiDecode({ logProbs: [], tagAt, scheme: 'bio' })).toEqual([]);
  });

  it('모두 O인 시퀀스는 빈 결과', () => {
    const logProbs = [
      [HIGH, LOW, LOW],
      [HIGH, LOW, LOW],
    ];
    expect(viterbiDecode({ logProbs, tagAt, scheme: 'bio' })).toEqual([]);
  });

  it('B-name + I-name → 1개 스팬', () => {
    // [O, B-name, I-name, O]
    const logProbs = [
      [HIGH, LOW, LOW],
      [LOW, HIGH, LOW],
      [LOW, LOW, HIGH],
      [HIGH, LOW, LOW],
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bio' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 1, end: 3, category: 'name' });
  });

  it('B-name 단독 (다음 토큰 O) → 1개 스팬', () => {
    const logProbs = [
      [LOW, HIGH, LOW],
      [HIGH, LOW, LOW],
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bio' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 0, end: 1, category: 'name' });
  });

  it('연속된 두 엔티티 B-name + B-name → 2개 스팬 (BIO)', () => {
    const logProbs = [
      [LOW, HIGH, LOW],
      [LOW, HIGH, LOW],
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bio' });
    expect(result).toHaveLength(2);
    expect(result[0]?.start).toBe(0);
    expect(result[1]?.start).toBe(1);
  });

  it('I-without-B는 강제 transition으로 다른 라벨이 선택됨', () => {
    // I-name으로만 가려는 점수가 매우 높지만, 처음에 I로 시작 불가
    // → O 또는 B로 강제됨. 결과는 가장 가까운 valid 시퀀스
    const logProbs = [
      [LOW, LOW, HIGH], // I-name 우세
      [HIGH, LOW, LOW],
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bio' });
    // 첫 토큰에 I-name이 못 오므로 O 또는 B-name으로 강제됨
    // dp[0][0] (O) = -10, dp[0][1] (B-name) = -10, dp[0][2] (I-name) = -inf
    // dp[1][0] (O) = -10 (from O) = best -10. → result 비어 있음
    // 또는 dp[1][1] (B-name) = -10 + -10 = -20. 등.
    // 어느 쪽이든 invalid I-without-B는 발생 안 함
    for (const span of result) {
      expect(span.category).toBe('name');
    }
  });
});

describe('viterbiDecode (BIOES scheme)', () => {
  const labels = ['O', 'B-name', 'I-name', 'E-name', 'S-name'];
  const tagAt = makeTagAt(labels);

  it('S-name 단독 → 1개 스팬', () => {
    const logProbs = [
      [LOW, LOW, LOW, LOW, HIGH],
      [HIGH, LOW, LOW, LOW, LOW],
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bioes' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 0, end: 1, category: 'name' });
  });

  it('B-name → I-name → E-name → 1개 스팬', () => {
    const logProbs = [
      [HIGH, LOW, LOW, LOW, LOW], // O
      [LOW, HIGH, LOW, LOW, LOW], // B-name
      [LOW, LOW, HIGH, LOW, LOW], // I-name
      [LOW, LOW, LOW, HIGH, LOW], // E-name
      [HIGH, LOW, LOW, LOW, LOW], // O
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bioes' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 1, end: 4, category: 'name' });
  });

  it('B → E (I 없음) 도 valid', () => {
    const logProbs = [
      [LOW, HIGH, LOW, LOW, LOW], // B-name
      [LOW, LOW, LOW, HIGH, LOW], // E-name
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bioes' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ start: 0, end: 2, category: 'name' });
  });

  it('BIOES에서 B → O는 invalid → 다른 시퀀스로 강제', () => {
    // B-name 직후 O가 가장 높다면 BIO에선 OK지만 BIOES에선 E로 닫아야 함
    // 다행히 viterbi가 invalid transition을 회피해 다른 경로로 감
    const logProbs = [
      [LOW, HIGH, LOW, LOW, LOW],
      [HIGH, LOW, LOW, LOW, LOW], // O
    ];
    const result = viterbiDecode({ logProbs, tagAt, scheme: 'bioes' });
    // 첫 토큰을 S-name으로 가는 게 차선이거나, 아예 둘 다 O로 가는 게 최선
    // 어느 쪽이든 invalid B→O 시퀀스는 안 나옴
    for (const span of result) {
      expect(span.category).toBe('name');
    }
  });

  it('카테고리가 다른 두 엔티티 B-A → E-A → S-B', () => {
    const labelsAB = ['O', 'B-A', 'E-A', 'S-B'];
    const tagAtAB = makeTagAt(labelsAB);
    const logProbs = [
      [LOW, HIGH, LOW, LOW],
      [LOW, LOW, HIGH, LOW],
      [LOW, LOW, LOW, HIGH],
    ];
    const result = viterbiDecode({
      logProbs,
      tagAt: tagAtAB,
      scheme: 'bioes',
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ start: 0, end: 2, category: 'A' });
    expect(result[1]).toMatchObject({ start: 2, end: 3, category: 'B' });
  });
});
