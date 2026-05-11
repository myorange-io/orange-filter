// 파일 큐 처리 파이프라인.
// S12: parsers/* + background DETECT_REQUEST + mask + exporters/* 통합.
// S13에서 HWP/HWPX 추가, S14에서 카테고리 토글 연동.
// v1.4: detect와 mask·export를 분리. settings.autoApplyMaskWithoutReview === false면
// detect 후 'reviewing' 상태로 정지, confirmReview() 호출 시 mask·export 진행.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  partitionBySize,
  type QueueItem,
  type SizeRejectReason,
} from './file-queue';
import { exportFile, parseFile } from './parsers';
import { detectSegments, maskSegmentsWithSpans, spanKey } from './mask-segments';
import { loadSettings, subscribeSettings, type Settings } from '@/shared/settings';

export interface UseFileQueueResult {
  items: QueueItem[];
  add: (files: File[]) => { rejected: SizeRejectReason[] };
  remove: (id: string) => void;
  clear: () => void;
  /** 검토 단계에서 사용자 토글 갱신 (모달이 호출) */
  setItemEnabledSpanKeys: (id: string, keys: Set<string>) => void;
  /** 검토 confirm — 토글 반영해 mask·export·다운로드 */
  confirmReview: (id: string) => Promise<void>;
}

function suffixedName(original: string, suffix = '_masked', overrideExt?: string): string {
  const idx = original.lastIndexOf('.');
  if (idx < 0) return `${original}${suffix}${overrideExt ?? ''}`;
  const base = original.slice(0, idx);
  const ext = overrideExt ?? original.slice(idx);
  return `${base}${suffix}${ext}`;
}

/** HWP/이미지(OCR)는 v1에서 round-trip 불가 → TXT로 fallback */
function shouldFallbackToTxt(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.hwp') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp')
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function useFileQueue(): UseFileQueueResult {
  const [items, setItems] = useState<QueueItem[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;
  const settingsRef = useRef<Settings | null>(null);

  useEffect(() => {
    void loadSettings().then((s) => {
      settingsRef.current = s;
    });
    return subscribeSettings((s) => {
      settingsRef.current = s;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // detect 단계 — parse + detectSegments. enabledSpanKeys default(모든 ON) 설정.
  const runDetect = useCallback(
    async (item: QueueItem): Promise<void> => {
      update(item.id, { status: 'extracting', progress: 5 });
      const parsed = await parseFile(item.file);
      update(item.id, { progress: 35, status: 'detecting' });
      const { spansBySegment, totalSpans } = await detectSegments(parsed.segments, {
        onProgress: (done, total) => {
          const pct = total === 0 ? 80 : 35 + Math.round((done / total) * 45);
          update(item.id, { progress: pct });
        },
      });
      update(item.id, { progress: 80 });
      const enabledSpanKeys = new Set<string>();
      for (const spans of spansBySegment.values()) {
        for (const s of spans) enabledSpanKeys.add(spanKey(s));
      }
      // 0건 또는 자동 적용 모드: 검토 skip 후 즉시 export.
      const autoApply = settingsRef.current?.autoApplyMaskWithoutReview ?? false;
      if (totalSpans === 0 || autoApply) {
        update(item.id, {
          status: 'masking',
          progress: 85,
          parsed,
          spansBySegment,
          enabledSpanKeys,
          detectedCount: totalSpans,
        });
        await runExport(item.id, parsed, spansBySegment, enabledSpanKeys, item.file, totalSpans);
        return;
      }
      // 검토 대기 — 사용자 confirm 기다림.
      update(item.id, {
        status: 'reviewing',
        progress: 80,
        parsed,
        spansBySegment,
        enabledSpanKeys,
        detectedCount: totalSpans,
      });
    },
    [update],
  );

  // export 단계 — maskSegmentsWithSpans + exportFile + 다운로드.
  const runExport = useCallback(
    async (
      id: string,
      parsed: NonNullable<QueueItem['parsed']>,
      spansBySegment: NonNullable<QueueItem['spansBySegment']>,
      enabledSpanKeys: Set<string>,
      file: File,
      detectedCount: number,
    ): Promise<void> => {
      update(id, { status: 'masking', progress: 85 });
      const { maskedMap, totalSpans: appliedCount } = maskSegmentsWithSpans(
        parsed.segments,
        spansBySegment,
        enabledSpanKeys,
      );
      const blob = await exportFile(file, maskedMap);
      update(id, { progress: 95 });
      const outputName = shouldFallbackToTxt(file)
        ? suffixedName(file.name, '_masked', '.txt')
        : suffixedName(file.name);
      downloadBlob(blob, outputName);
      update(id, {
        status: 'done',
        progress: 100,
        appliedCount,
        detectedCount,
      });
    },
    [update],
  );

  const add = useCallback(
    (files: File[]) => {
      const currentTotal = itemsRef.current.reduce((sum, it) => sum + it.file.size, 0);
      const { accepted, rejected } = partitionBySize(files, currentTotal);
      const newItems: QueueItem[] = accepted.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        status: 'queued',
        progress: 0,
      }));
      if (newItems.length > 0) setItems((prev) => [...prev, ...newItems]);
      for (const item of newItems) {
        runDetect(item).catch((err: unknown) => {
          update(item.id, {
            status: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        });
      }
      return { rejected };
    },
    [runDetect, update],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const setItemEnabledSpanKeys = useCallback(
    (id: string, keys: Set<string>) => {
      update(id, { enabledSpanKeys: keys });
    },
    [update],
  );

  const confirmReview = useCallback(
    async (id: string): Promise<void> => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item || !item.parsed || !item.spansBySegment) return;
      const keys = item.enabledSpanKeys ?? new Set<string>();
      try {
        await runExport(
          id,
          item.parsed,
          item.spansBySegment,
          keys,
          item.file,
          item.detectedCount ?? 0,
        );
      } catch (err) {
        update(id, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [runExport, update],
  );

  return { items, add, remove, clear, setItemEnabledSpanKeys, confirmReview };
}
