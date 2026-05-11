// Paste Modal — 3-pane 투명성 UI.
// Pane 1: 원본 (read-only, <mark> 하이라이트, 클릭 시 active span 변경)
// Pane 2: 탐지 항목 리스트 (span별 ON/OFF + 카테고리 모드 picker)
// Pane 3: 마스킹 결과 textarea (자유 편집 가능)
// 액션: 1.5s hold "원본 그대로" / 취소 / "N건 가리고 붙여넣기"

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Shield } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { HoldButton } from '@/shared/ui/HoldButton';
import { Textarea } from '@/shared/ui/textarea';
import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import { maskText, spanKey } from '@/background/pii/mask';
import {
  defaultSettings,
  incrementStats,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/shared/settings';
import type { DetectResult, MaskMode, PIICategory } from '@/shared/types';
import { HighlightedText } from './HighlightedText';
import { SpanReviewList } from './SpanReviewList';

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

/**
 * Radix Dialog의 RemoveScroll이 wheel 이벤트를 capture phase에서 가로채 내부
 * scrollable element에 도달하지 못함. 우리가 element.scrollTop을 직접 변경해서
 * 우회 — JS로 직접 변경한 scroll은 RemoveScroll이 막을 수 없다.
 */
function manualWheelScroll(e: React.WheelEvent<HTMLElement>): void {
  e.currentTarget.scrollTop += e.deltaY;
}

export function PasteModal({
  open,
  onOpenChange,
  text,
  detectResult,
  onConfirm,
  onCancel: _onCancel,
}: PasteModalProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [enabledByCategory, setEnabledByCategory] = useState(settings.enabledByCategory);
  const [modeByCategory, setModeByCategory] = useState(settings.modeByCategory);
  const [enabledSpanKeys, setEnabledSpanKeys] = useState<Set<string>>(new Set());
  const [activeSpanKey, setActiveSpanKey] = useState<string | null>(null);
  const [userEditedText, setUserEditedText] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // 모달 열릴 때 settings + span 토글 default 초기화.
  useEffect(() => {
    if (!open) return;
    void loadSettings().then((s) => {
      setSettings(s);
      setEnabledByCategory(s.enabledByCategory);
      setModeByCategory(s.modeByCategory);
    });
    // 모든 span 기본 ON. 카테고리 OFF는 maskText에서 추가로 걸러줌.
    setEnabledSpanKeys(new Set(detectResult.spans.map(spanKey)));
    setActiveSpanKey(null);
    setUserEditedText(null);
  }, [open, detectResult]);

  // 안전한 default focus — 모달 열릴 때 confirm 버튼으로.
  // Radix focus trap 기본은 첫 focusable(X 버튼)로 이동 → Enter 시 의도와 반대(취소).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => confirmButtonRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // 테마 적용 — shadow host element에 'dark' 클래스 토글.
  useEffect(() => {
    const host = document.getElementById('oi-filter-shadow-host');
    if (host) host.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

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
        enabledSpanKeys,
      }),
    [text, detectResult, enabledByCategory, modeByCategory, enabledSpanKeys],
  );

  // 카테고리 OFF + spanKey OFF가 합쳐 "비활성"으로 보여야 원본 하이라이트가 정확.
  const disabledKeys = useMemo(() => {
    const out = new Set<string>();
    for (const span of detectResult.spans) {
      const catOn = enabledByCategory[span.category] ?? true;
      const k = spanKey(span);
      if (!catOn || !enabledSpanKeys.has(k)) out.add(k);
    }
    return out;
  }, [detectResult, enabledByCategory, enabledSpanKeys]);

  const totalFound = detectResult.spans.length;
  const totalMasked = preview.applied.length;
  const cumulative = settings.stats.totalSpansMasked + totalMasked;

  // textarea 표시 값: 사용자가 편집했으면 그것, 아니면 자동 계산된 미리보기.
  const textareaValue = userEditedText ?? preview.text;
  const isDirty = userEditedText !== null && userEditedText !== preview.text;

  const handleSpanToggle = (key: string, enabled: boolean) => {
    setEnabledSpanKeys((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleCategoryModeChange = (category: PIICategory, mode: MaskMode) => {
    setModeByCategory((s) => ({ ...s, [category]: mode }));
  };

  const handleResetEdit = () => setUserEditedText(null);

  const handleConfirm = () => {
    void saveSettings({
      ...settings,
      enabledByCategory,
      modeByCategory,
    });
    void incrementStats(totalMasked);
    // 사용자 편집이 있으면 그 텍스트, 없으면 계산된 마스킹 결과.
    const finalText = userEditedText ?? preview.text;
    onConfirm(finalText, { enabledByCategory, modeByCategory });
  };

  const handleHoldOverride = () => {
    // 마스킹 없이 원본 그대로 — 카운터 증가 안 함.
    onConfirm(text, { enabledByCategory: {}, modeByCategory: {} });
  };

  const visibleCategories = CATEGORY_ORDER.filter((c) => countsByCategory.has(c));
  const allOff = totalMasked === 0 && totalFound > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" onWheel={manualWheelScroll}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" aria-hidden />
            개인정보 {totalFound}건 발견했어요
          </DialogTitle>
          <DialogDescription>
            아래 항목을 가린 뒤 붙여넣을게요. 모든 처리는 이 PC 안에서 이뤄집니다.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex flex-wrap gap-2"
          role="list"
          aria-label="발견된 개인정보 카테고리"
        >
          {visibleCategories.map((c) => {
            const def = CATEGORIES[c];
            const count = countsByCategory.get(c) ?? 0;
            const enabled = enabledByCategory[c];
            return (
              <Badge
                key={c}
                variant={enabled ? 'accent' : 'outline'}
                role="listitem"
                aria-label={`${def.labelKo} ${count}건 ${enabled ? '가림' : '미가림'}`}
              >
                {def.labelKo} · {count}
              </Badge>
            );
          })}
        </div>

        {/* Pane 1: 원본 — 하이라이트 */}
        <section
          className="rounded-md border bg-muted/40 p-3"
          aria-label="원본 텍스트"
        >
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">원본</div>
          <div className="max-h-32 overflow-auto" onWheel={manualWheelScroll}>
            <HighlightedText
              text={text}
              spans={detectResult.spans}
              activeSpanKey={activeSpanKey}
              disabledSpanKeys={disabledKeys}
              onSpanClick={setActiveSpanKey}
            />
          </div>
        </section>

        {/* Pane 2: 탐지 항목 리스트 (모드 picker 포함) */}
        <section aria-label="탐지된 개인정보 항목 목록">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            탐지 항목 — 가림 여부와 마스킹 방식을 항목별로 바꿀 수 있어요
          </div>
          <div className="max-h-44 overflow-auto pr-1" onWheel={manualWheelScroll}>
            <SpanReviewList
              spans={detectResult.spans}
              enabledSpanKeys={enabledSpanKeys}
              modeByCategory={modeByCategory}
              activeSpanKey={activeSpanKey}
              onToggle={handleSpanToggle}
              onModeChange={handleCategoryModeChange}
              onActivate={setActiveSpanKey}
            />
          </div>
        </section>

        {/* Pane 3: 마스킹 결과 — 자유 편집 textarea */}
        <section aria-label="마스킹 결과 미리보기">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>붙여넣을 텍스트 (직접 수정 가능)</span>
            {isDirty && (
              <button
                type="button"
                onClick={handleResetEdit}
                className="inline-flex items-center gap-1 text-foreground hover:text-primary"
                aria-label="편집 초기화"
              >
                <RotateCcw className="h-3 w-3" />
                초기화
              </button>
            )}
          </div>
          <Textarea
            value={textareaValue}
            onChange={(e) => setUserEditedText(e.target.value)}
            rows={6}
            className="max-h-40 overflow-y-auto font-sans text-sm"
            aria-live="polite"
            onWheel={manualWheelScroll}
          />
          {isDirty && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              직접 편집했어요. 토글을 다시 바꾸면 편집 내용이 사라집니다.
            </p>
          )}
        </section>

        <DialogFooter className="flex-wrap gap-2 sm:gap-2 sm:flex-nowrap">
          <HoldButton onConfirm={handleHoldOverride} className="text-xs">
            꾹 누르면 원본 그대로
          </HoldButton>
          <div className="flex flex-1 justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              aria-label="취소하고 원래대로 돌아가기"
            >
              취소
            </Button>
            <Button
              ref={confirmButtonRef}
              onClick={handleConfirm}
              variant={allOff ? 'destructive' : 'default'}
              aria-label={
                allOff
                  ? '모두 끔 — 원본 그대로 붙여넣기'
                  : `${totalMasked}건 가리고 안전하게 붙여넣기`
              }
            >
              {allOff ? '원본 그대로 붙여넣기' : `${totalMasked}건 가리고 붙여넣기`}
            </Button>
          </div>
        </DialogFooter>

        {/* Peak-End — 스크린리더 누적 알림 */}
        <span className="sr-only" aria-live="polite">
          {totalMasked > 0
            ? `${totalMasked}건을 가립니다. 지금까지 이 PC에서 ${cumulative}건이 보호됐어요.`
            : '가릴 항목이 없습니다.'}
        </span>
      </DialogContent>
    </Dialog>
  );
}
