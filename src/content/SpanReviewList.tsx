// 탐지 항목 리스트 — 각 PIISpan을 한 행으로. 카테고리 + 원본 + 마스킹 미리보기 +
// 모드 picker(카테고리별 mode 동기) + ON/OFF 스위치.
// PasteModal과 FileReviewDialog 양쪽이 공유.

import { useEffect, useRef } from 'react';
import { Switch } from '@/shared/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { CATEGORIES, DEFAULT_MODES } from '@/background/pii/categories';
import { applyMask, getMaskExample, spanKey } from '@/background/pii/mask';
import type { MaskMode, PIICategory, PIISpan } from '@/shared/types';

const MODE_LABELS: Record<MaskMode, string> = {
  shape: '형태',
  partial: '부분',
  tag: '태그',
  fake: '가짜',
  remove: '제거',
};

export interface SpanReviewListProps {
  spans: ReadonlyArray<PIISpan>;
  enabledSpanKeys: ReadonlySet<string>;
  /** 카테고리별 마스킹 모드 — 미리보기 + picker 값 */
  modeByCategory: Partial<Record<PIICategory, MaskMode>>;
  activeSpanKey?: string | null;
  onToggle: (key: string, enabled: boolean) => void;
  /** 모드 picker 변경 — 같은 카테고리 모든 span에 동기 적용. 미지정 시 picker 숨김. */
  onModeChange?: (category: PIICategory, mode: MaskMode) => void;
  onActivate?: (key: string) => void;
  /** 0건일 때 표시할 메시지. 기본 "발견된 항목 없음" */
  emptyMessage?: string;
}

export function SpanReviewList({
  spans,
  enabledSpanKeys,
  modeByCategory,
  activeSpanKey,
  onToggle,
  onModeChange,
  onActivate,
  emptyMessage = '발견된 항목이 없습니다.',
}: SpanReviewListProps) {
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!activeSpanKey) return;
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeSpanKey]);

  if (spans.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-1.5" aria-label="탐지된 개인정보 항목">
      {spans.map((span) => {
        const key = spanKey(span);
        const def = CATEGORIES[span.category];
        const mode = modeByCategory[span.category] ?? def.defaultMaskMode;
        const enabled = enabledSpanKeys.has(key);
        const masked = applyMask(span, mode);
        const isActive = key === activeSpanKey;
        const allowedModes = def.allowedModes ?? DEFAULT_MODES;
        return (
          <li
            key={key}
            ref={isActive ? activeRowRef : null}
            className={[
              'rounded-md border bg-card p-2 text-sm',
              isActive ? 'ring-2 ring-primary' : '',
              enabled ? '' : 'opacity-60',
            ].join(' ')}
            onClick={() => onActivate?.(key)}
          >
            {/* 1줄: dot + 카테고리 라벨 + 원본→마스킹(wrap) + Switch */}
            <div className="flex items-start gap-2">
              <span
                className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                aria-hidden
              />
              <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground">
                {def.labelKo}
              </span>
              <span className="min-w-0 flex-1 break-words font-mono text-xs">
                <span>{span.text}</span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span className={enabled ? 'text-primary' : 'text-muted-foreground line-through'}>
                  {enabled ? masked : span.text}
                </span>
              </span>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => onToggle(key, v)}
                aria-label={`${def.labelKo} '${span.text}' ${enabled ? '가림 끄기' : '가림 켜기'}`}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* 2줄: 마스킹 모드 picker (들여쓰기, dot+gap 너비만큼) */}
            {onModeChange && (
              <div className="mt-1.5 pl-4">
                <Select
                  value={mode}
                  onValueChange={(v) => onModeChange(span.category, v as MaskMode)}
                >
                  <SelectTrigger
                    className="h-8 w-[110px] text-xs"
                    aria-label={`${def.labelKo} 마스킹 모드`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue>{MODE_LABELS[mode]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allowedModes.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        <span className="flex items-baseline gap-2">
                          <span>{MODE_LABELS[m]}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {getMaskExample(span.category, m)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
