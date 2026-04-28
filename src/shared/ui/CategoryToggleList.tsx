// 카테고리 토글 리스트 — 16 카테고리 × ON/OFF + 4 마스킹 모드.
// 사이드패널 필터 탭 + paste 모달 고급 설정 양쪽에서 공용.

import { Switch } from './switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import { getMaskExample } from '@/background/pii/mask';
import type { MaskMode, PIICategory } from '@/shared/types';

const MODE_LABELS: Record<MaskMode, string> = {
  shape: '형태 보존',
  tag: '태그 치환',
  fake: '가짜 데이터',
  remove: '완전 제거',
};

export interface CategoryToggleListProps {
  enabledByCategory: Partial<Record<PIICategory, boolean>>;
  modeByCategory: Partial<Record<PIICategory, MaskMode>>;
  /** 발견된 카테고리만 보여주려면 전달 (Map<category, count>). 미전달 시 전체 16개 표시. */
  countsByCategory?: ReadonlyMap<PIICategory, number>;
  onToggle: (category: PIICategory, enabled: boolean) => void;
  onModeChange: (category: PIICategory, mode: MaskMode) => void;
  /** 컴팩트 모드 (paste 모달용 — mode picker 숨김) */
  compact?: boolean;
}

export function CategoryToggleList({
  enabledByCategory,
  modeByCategory,
  countsByCategory,
  onToggle,
  onModeChange,
  compact = false,
}: CategoryToggleListProps) {
  const visible = countsByCategory
    ? CATEGORY_ORDER.filter((c) => countsByCategory.has(c))
    : CATEGORY_ORDER;

  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">발견된 카테고리가 없습니다.</p>
    );
  }

  return (
    <ul className="space-y-2.5" aria-label="카테고리별 마스킹 설정">
      {visible.map((id) => {
        const def = CATEGORIES[id];
        const enabled = enabledByCategory[id] ?? def.defaultEnabled;
        const mode = modeByCategory[id] ?? def.defaultMaskMode;
        const count = countsByCategory?.get(id);
        return (
          <li key={id} className="rounded-md border bg-card p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{def.labelKo}</div>
                {typeof count === 'number' && (
                  <div className="text-xs text-muted-foreground">{count}건 발견</div>
                )}
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => onToggle(id, v)}
                aria-label={`${def.labelKo} 마스킹 ${enabled ? '끄기' : '켜기'}`}
              />
            </div>
            {!compact && enabled && (
              <div className="mt-2">
                <Select value={mode} onValueChange={(v) => onModeChange(id, v as MaskMode)}>
                  <SelectTrigger className="h-8 w-full text-xs" aria-label={`${def.labelKo} 마스킹 모드`}>
                    {/* 트리거에는 모드 라벨만. 드롭다운 펼치면 옵션마다 예시. */}
                    <SelectValue>{MODE_LABELS[mode]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABELS) as MaskMode[]).map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        <span className="flex items-baseline gap-2">
                          <span>{MODE_LABELS[m]}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {getMaskExample(id, m)}
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
