// Paste Modal — 2-tier UI.
// Tier 1: 발견 건수 + 마스킹 미리보기 + "마스킹 후 붙여넣기" / 취소 / 1.5s hold "그대로"
// Tier 2: per-category 토글 + 마스킹 모드 (4종)

import { useEffect, useMemo, useState } from 'react';
import { Settings2, Shield } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CategoryToggleList } from '@/shared/ui/CategoryToggleList';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { HoldButton } from '@/shared/ui/HoldButton';
import { Separator } from '@/shared/ui/separator';
import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import { maskText } from '@/background/pii/mask';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/shared/settings';
import type { DetectResult, MaskMode, PIICategory } from '@/shared/types';

export interface PasteDecisions {
  enabledByCategory: Partial<Record<PIICategory, boolean>>;
  modeByCategory: Partial<Record<PIICategory, MaskMode>>;
}

export interface PasteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  detectResult: DetectResult;
  onConfirm: (maskedText: string, decisions: PasteDecisions) => void;
  /** 1.5초 hold 후 "그대로 붙여넣기" — onConfirm에 원본 그대로 전달 */
  onCancel: () => void;
}

export function PasteModal({
  open,
  onOpenChange,
  text,
  detectResult,
  onConfirm,
  onCancel,
}: PasteModalProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [enabledByCategory, setEnabledByCategory] = useState(settings.enabledByCategory);
  const [modeByCategory, setModeByCategory] = useState(settings.modeByCategory);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 모달 열릴 때 settings 동기화 (sidepanel에서 변경됐을 수 있음)
  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setEnabledByCategory(s.enabledByCategory);
      setModeByCategory(s.modeByCategory);
    });
  }, [open]);

  const countsByCategory = useMemo(() => {
    const m = new Map<PIICategory, number>();
    for (const span of detectResult.spans) {
      m.set(span.category, (m.get(span.category) ?? 0) + 1);
    }
    return m;
  }, [detectResult]);

  const preview = useMemo(
    () =>
      maskText(text, detectResult.spans, {
        enabledByCategory,
        modeByCategory,
      }),
    [text, detectResult, enabledByCategory, modeByCategory],
  );

  const totalFound = detectResult.spans.length;
  const totalMasked = preview.applied.length;

  const handleConfirm = () => {
    // 사용자 결정을 settings로도 영속화 (다음 paste에 동일 default)
    void saveSettings({
      ...settings,
      enabledByCategory,
      modeByCategory,
    });
    onConfirm(preview.text, { enabledByCategory, modeByCategory });
  };

  const handleHoldOverride = () => {
    // 마스킹 없이 원본 그대로
    onConfirm(text, { enabledByCategory: {}, modeByCategory: {} });
  };

  const visibleCategories = CATEGORY_ORDER.filter((c) => countsByCategory.has(c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            개인정보 {totalFound}건 발견
          </DialogTitle>
          <DialogDescription>
            아래 항목을 가린 뒤 붙여넣을게요. 모든 처리는 이 PC 안에서 이뤄집니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {visibleCategories.map((c) => {
            const def = CATEGORIES[c];
            const count = countsByCategory.get(c) ?? 0;
            const enabled = enabledByCategory[c];
            return (
              <Badge key={c} variant={enabled ? 'accent' : 'outline'}>
                {def.labelKo} · {count}
              </Badge>
            );
          })}
        </div>

        <section className="rounded-md border bg-muted/40 p-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">미리보기</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm max-h-40 overflow-auto">
            {preview.text}
          </pre>
        </section>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showAdvanced ? '고급 설정 닫기' : '카테고리별 설정'}
        </button>

        {showAdvanced && (
          <>
            <Separator />
            <div className="max-h-[280px] overflow-y-auto pr-1">
              <CategoryToggleList
                enabledByCategory={enabledByCategory}
                modeByCategory={modeByCategory}
                countsByCategory={countsByCategory}
                onToggle={(cat, v) => setEnabledByCategory((s) => ({ ...s, [cat]: v }))}
                onModeChange={(cat, m) => setModeByCategory((s) => ({ ...s, [cat]: m }))}
              />
            </div>
          </>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:gap-2 sm:flex-nowrap">
          <HoldButton onConfirm={handleHoldOverride} className="text-xs">
            꾹 누르면 원본 그대로
          </HoldButton>
          <div className="flex flex-1 justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleConfirm}>{totalMasked}건 가리고 붙여넣기</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
