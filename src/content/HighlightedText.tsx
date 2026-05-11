// 텍스트 + spans → <mark> 인라인 하이라이트 렌더러.
// PasteModal의 "원본" pane에서 사용. 클릭 시 onSpanClick으로 active span 동기화.
//
// 비겹침 보장: maskText와 같은 정렬·dedupe 규칙으로 spans를 정렬한 뒤 cursor로 슬라이스.
// 같은 위치에 카테고리 후보가 여럿이면 첫 것만 하이라이트 (skipped는 회색 처리는 리스트 책임).

import { useMemo } from 'react';
import { spanKey } from '@/background/pii/mask';
import type { PIISpan } from '@/shared/types';

export interface HighlightedTextProps {
  text: string;
  spans: ReadonlyArray<PIISpan>;
  /** 활성 span 키 — ring 강조 */
  activeSpanKey?: string | null;
  /** 비활성된(토글 OFF) span 키 — 옅은 색 처리 */
  disabledSpanKeys?: ReadonlySet<string>;
  onSpanClick?: (key: string) => void;
}

export function HighlightedText({
  text,
  spans,
  activeSpanKey,
  disabledSpanKeys,
  onSpanClick,
}: HighlightedTextProps) {
  const parts = useMemo(() => {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const nonOverlapping: PIISpan[] = [];
    for (const s of sorted) {
      const last = nonOverlapping[nonOverlapping.length - 1];
      if (last && s.start < last.end) continue;
      nonOverlapping.push(s);
    }
    const out: Array<
      | { kind: 'text'; value: string }
      | { kind: 'mark'; value: string; span: PIISpan; key: string }
    > = [];
    let cursor = 0;
    for (const s of nonOverlapping) {
      if (s.start > cursor) out.push({ kind: 'text', value: text.slice(cursor, s.start) });
      out.push({
        kind: 'mark',
        value: text.slice(s.start, s.end),
        span: s,
        key: spanKey(s),
      });
      cursor = s.end;
    }
    if (cursor < text.length) out.push({ kind: 'text', value: text.slice(cursor) });
    return out;
  }, [text, spans]);

  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm">
      {parts.map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.value}</span>;
        const isActive = p.key === activeSpanKey;
        const isDisabled = disabledSpanKeys?.has(p.key) ?? false;
        return (
          <mark
            key={i}
            data-span-key={p.key}
            data-category={p.span.category}
            onClick={() => onSpanClick?.(p.key)}
            className={[
              'cursor-pointer rounded-sm px-0.5',
              isDisabled
                ? 'bg-muted text-muted-foreground line-through decoration-muted-foreground/60'
                : 'bg-primary/15 text-foreground',
              isActive ? 'ring-2 ring-primary ring-offset-1' : '',
            ].join(' ')}
          >
            {p.value}
          </mark>
        );
      })}
    </pre>
  );
}
