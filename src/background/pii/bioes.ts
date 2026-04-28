// Constrained Viterbi BIOES/BIO decoder.
// Re-implementation patterned after openai/privacy-filter's `opf/_core/`
// decoder (Apache-2.0). No source code copied; algorithm/structure only.
// See LICENSES/privacy-filter-NOTICE.txt for attribution.

export type Tag =
  | 'O'
  | { readonly prefix: 'B' | 'I' | 'E' | 'S'; readonly category: string };

export interface DecodedSpan {
  /** token index (inclusive) */
  start: number;
  /** token index (exclusive) */
  end: number;
  category: string;
  /** mean logprob over the span tokens */
  score: number;
}

export interface DecoderInput {
  /** [T, K] token-by-label logprob matrix. */
  logProbs: ReadonlyArray<ReadonlyArray<number>>;
  /** K -> Tag mapping */
  tagAt: (index: number) => Tag;
  /** label scheme */
  scheme: 'bioes' | 'bio';
}

const NEG_INF = -1e9;

function transitionAllowed(
  prev: Tag,
  next: Tag,
  scheme: 'bioes' | 'bio',
): boolean {
  // Outside → ?
  if (prev === 'O') {
    if (next === 'O') return true;
    if (next.prefix === 'B' || next.prefix === 'S') return true;
    return false; // I/E without B — invalid
  }
  // B / I (entity continues)
  if (prev.prefix === 'B' || prev.prefix === 'I') {
    if (next === 'O') {
      // BIO: B/I → O ends the entity. BIOES: must close with E first.
      return scheme === 'bio';
    }
    if (next.prefix === 'I' || next.prefix === 'E') {
      return next.category === prev.category;
    }
    if (next.prefix === 'B' || next.prefix === 'S') {
      // BIO: starting a new entity right after B/I is allowed.
      // BIOES: must close with E first.
      return scheme === 'bio';
    }
    return false;
  }
  // E / S (entity closed)
  if (prev.prefix === 'E' || prev.prefix === 'S') {
    if (next === 'O') return true;
    if (next.prefix === 'B' || next.prefix === 'S') return true;
    return false;
  }
  return false;
}

export function viterbiDecode(input: DecoderInput): DecodedSpan[] {
  const { logProbs, tagAt, scheme } = input;
  const T = logProbs.length;
  if (T === 0) return [];
  const K = logProbs[0]!.length;

  const dp: number[][] = Array.from({ length: T }, () =>
    new Array<number>(K).fill(NEG_INF),
  );
  const back: number[][] = Array.from({ length: T }, () =>
    new Array<number>(K).fill(0),
  );

  // Initialize from virtual prev='O'
  for (let k = 0; k < K; k++) {
    if (transitionAllowed('O', tagAt(k), scheme)) {
      dp[0]![k] = logProbs[0]![k]!;
    }
  }

  // Forward pass
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      const tag = tagAt(k);
      let best = NEG_INF;
      let bestPrev = 0;
      for (let kPrev = 0; kPrev < K; kPrev++) {
        const prevScore = dp[t - 1]![kPrev]!;
        if (prevScore <= NEG_INF) continue;
        if (!transitionAllowed(tagAt(kPrev), tag, scheme)) continue;
        const score = prevScore + logProbs[t]![k]!;
        if (score > best) {
          best = score;
          bestPrev = kPrev;
        }
      }
      dp[t]![k] = best;
      back[t]![k] = bestPrev;
    }
  }

  // Best terminal
  let bestEndK = 0;
  let bestEndScore = NEG_INF;
  for (let k = 0; k < K; k++) {
    if (dp[T - 1]![k]! > bestEndScore) {
      bestEndScore = dp[T - 1]![k]!;
      bestEndK = k;
    }
  }

  // Backtrace
  const path: number[] = new Array<number>(T);
  path[T - 1] = bestEndK;
  for (let t = T - 1; t > 0; t--) {
    path[t - 1] = back[t]![path[t]!]!;
  }

  return tagPathToSpans(path, tagAt, scheme, logProbs);
}

function tagPathToSpans(
  path: ReadonlyArray<number>,
  tagAt: (index: number) => Tag,
  scheme: 'bioes' | 'bio',
  logProbs: ReadonlyArray<ReadonlyArray<number>>,
): DecodedSpan[] {
  const spans: DecodedSpan[] = [];
  const tags = path.map(tagAt);
  let i = 0;

  while (i < tags.length) {
    const tag = tags[i]!;
    if (tag === 'O') {
      i++;
      continue;
    }
    if (tag.prefix === 'S') {
      spans.push({
        start: i,
        end: i + 1,
        category: tag.category,
        score: logProbs[i]![path[i]!]!,
      });
      i++;
      continue;
    }
    if (tag.prefix === 'B') {
      let j = i + 1;
      let scoreSum = logProbs[i]![path[i]!]!;
      let count = 1;
      while (j < tags.length) {
        const t = tags[j]!;
        if (t === 'O') break;
        if (
          (t.prefix === 'I' || t.prefix === 'E') &&
          t.category === tag.category
        ) {
          scoreSum += logProbs[j]![path[j]!]!;
          count++;
          if (t.prefix === 'E' && scheme === 'bioes') {
            j++;
            break;
          }
          j++;
          continue;
        }
        // B/S of any category, or I/E of different category — stop
        break;
      }
      spans.push({
        start: i,
        end: j,
        category: tag.category,
        score: scoreSum / count,
      });
      i = j;
      continue;
    }
    // I/E without preceding B — viterbi shouldn't produce this, but skip safely
    i++;
  }
  return spans;
}
