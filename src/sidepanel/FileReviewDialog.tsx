// 파일 검토 모달 — detect 결과를 사용자에게 보여주고 span 단위로 토글.
// confirm 시 use-file-queue의 confirmReview가 mask·export·다운로드를 진행.

import { useEffect, useMemo, useState } from 'react';
import { FileText, Shield } from 'lucide-react';
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
import { Separator } from '@/shared/ui/separator';
import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import { spanKey } from '@/background/pii/mask';
import { defaultSettings, loadSettings, type Settings } from '@/shared/settings';
import type { PIICategory, PIISpan } from '@/shared/types';
import type { QueueItem } from './file-queue';
import { fileExtension } from './file-queue';
import { formatSegmentLabel } from './parsers/segment-label';
import { SpanReviewList } from '@/content/SpanReviewList';

export interface FileReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: QueueItem | null;
  onConfirm: (id: string, enabledSpanKeys: Set<string>) => void;
  /** 1.5초 hold "원본 그대로" — 모든 토글 OFF로 confirm */
  onCancel?: () => void;
}

interface SegmentGroup {
  segmentId: string;
  label: string;
  spans: PIISpan[];
}

const FLATTEN_THRESHOLD = 3; // 전체 spans ≤ 이 값이면 그룹 헤더 생략
const LARGE_WARN_THRESHOLD = 1000;

export function FileReviewDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: FileReviewDialogProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [enabledSpanKeys, setEnabledSpanKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    void loadSettings().then(setSettings);
    if (item?.enabledSpanKeys) {
      setEnabledSpanKeys(new Set(item.enabledSpanKeys));
    } else {
      setEnabledSpanKeys(new Set());
    }
  }, [open, item]);

  const ext = item ? fileExtension(item.file) : '';

  const groups = useMemo<SegmentGroup[]>(() => {
    if (!item?.parsed || !item.spansBySegment) return [];
    const out: SegmentGroup[] = [];
    for (const seg of item.parsed.segments) {
      const spans = item.spansBySegment.get(seg.id) ?? [];
      if (spans.length === 0) continue;
      out.push({
        segmentId: seg.id,
        label: formatSegmentLabel(seg.id, ext),
        spans: [...spans],
      });
    }
    return out;
  }, [item, ext]);

  const allSpans = useMemo(() => groups.flatMap((g) => g.spans), [groups]);
  const totalFound = allSpans.length;
  const totalApplied = useMemo(
    () => allSpans.filter((s) => enabledSpanKeys.has(spanKey(s))).length,
    [allSpans, enabledSpanKeys],
  );

  const countsByCategory = useMemo(() => {
    const m = new Map<PIICategory, { total: number; on: number }>();
    for (const span of allSpans) {
      const k = spanKey(span);
      const cur = m.get(span.category) ?? { total: 0, on: 0 };
      cur.total += 1;
      if (enabledSpanKeys.has(k)) cur.on += 1;
      m.set(span.category, cur);
    }
    return m;
  }, [allSpans, enabledSpanKeys]);

  const flatten = totalFound <= FLATTEN_THRESHOLD;

  const setSpanEnabled = (key: string, enabled: boolean) => {
    setEnabledSpanKeys((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const setCategoryEnabled = (category: PIICategory, enabled: boolean) => {
    setEnabledSpanKeys((prev) => {
      const next = new Set(prev);
      for (const span of allSpans) {
        if (span.category !== category) continue;
        const k = spanKey(span);
        if (enabled) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const setAllEnabled = (enabled: boolean) => {
    if (enabled) {
      setEnabledSpanKeys(new Set(allSpans.map(spanKey)));
    } else {
      setEnabledSpanKeys(new Set());
    }
  };

  const handleConfirm = () => {
    if (!item) return;
    onConfirm(item.id, new Set(enabledSpanKeys));
  };

  const handleHoldOverride = () => {
    if (!item) return;
    onConfirm(item.id, new Set());
  };

  if (!item) return null;

  const allOff = totalApplied === 0 && totalFound > 0;
  const overLargeWarn = totalFound > LARGE_WARN_THRESHOLD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" aria-hidden />
            <span className="truncate">{item.file.name}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            발견 {totalFound}건 · 가림 {totalApplied}건
            {overLargeWarn && (
              <span className="ml-2 text-amber-600">
                (1,000건 초과 — 그룹은 기본 접힘)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 카테고리별 일괄 토글 + 전체 토글 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAllEnabled(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            전체 켜기
          </button>
          <span className="text-xs text-muted-foreground">/</span>
          <button
            type="button"
            onClick={() => setAllEnabled(false)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            전체 끄기
          </button>
          <Separator orientation="vertical" className="mx-1 h-4" />
          {CATEGORY_ORDER.filter((c) => countsByCategory.has(c)).map((c) => {
            const def = CATEGORIES[c];
            const counts = countsByCategory.get(c)!;
            const allOn = counts.on === counts.total;
            return (
              <Badge
                key={c}
                variant={allOn ? 'accent' : 'outline'}
                className="cursor-pointer select-none"
                onClick={() => setCategoryEnabled(c, !allOn)}
                role="button"
                aria-label={`${def.labelKo} ${counts.on}/${counts.total} ${allOn ? '전부 가림' : '일부/미가림'}`}
              >
                {def.labelKo} · {counts.on}/{counts.total}
              </Badge>
            );
          })}
        </div>

        {/* 항목 리스트 */}
        <div className="max-h-[360px] overflow-y-auto pr-1" aria-label="탐지된 PII 항목">
          {flatten ? (
            <SpanReviewList
              spans={allSpans}
              enabledSpanKeys={enabledSpanKeys}
              modeByCategory={settings.modeByCategory}
              onToggle={setSpanEnabled}
            />
          ) : (
            <ul className="space-y-3">
              {groups.map((g) => (
                <li key={g.segmentId}>
                  <details open={!overLargeWarn} className="group">
                    <summary className="cursor-pointer rounded-md bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      {g.label}{' '}
                      <span className="ml-1 text-[10px] tabular-nums">
                        ({g.spans.length}건)
                      </span>
                    </summary>
                    <div className="mt-1.5">
                      <SpanReviewList
                        spans={g.spans}
                        enabledSpanKeys={enabledSpanKeys}
                        modeByCategory={settings.modeByCategory}
                        onToggle={setSpanEnabled}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {totalFound === 0 && (
            <p className="text-xs text-muted-foreground">
              발견된 개인정보가 없습니다. 원본 그대로 저장됩니다.
            </p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:gap-2 sm:flex-nowrap">
          <HoldButton onConfirm={handleHoldOverride} className="text-xs">
            꾹 누르면 원본 그대로 저장
          </HoldButton>
          <div className="flex flex-1 justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              aria-label="검토 취소"
            >
              취소
            </Button>
            <Button
              onClick={handleConfirm}
              variant={allOff ? 'destructive' : 'default'}
              aria-label={
                allOff
                  ? '모두 끔 — 원본 그대로 저장'
                  : `${totalApplied}건 가리고 다운로드`
              }
            >
              {allOff
                ? '원본 그대로 저장'
                : `${totalApplied}건 가리고 다운로드`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
