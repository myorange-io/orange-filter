// 파일 큐 처리 파이프라인.
// S12: parsers/* + background DETECT_REQUEST + mask + exporters/* 통합.
// S13에서 HWP/HWPX 추가, S14에서 카테고리 토글 연동.

import { useCallback, useRef, useState } from 'react';
import {
  partitionBySize,
  formatMB,
  MAX_FILE_SIZE_BYTES,
  MAX_QUEUE_TOTAL_BYTES,
  type QueueItem,
  type SizeRejectReason,
} from './file-queue';
import { exportFile, parseFile } from './parsers';
import { maskSegments } from './mask-segments';

export interface UseFileQueueResult {
  items: QueueItem[];
  add: (files: File[]) => { rejected: SizeRejectReason[] };
  remove: (id: string) => void;
  clear: () => void;
}

interface ProcessOutcome {
  detectedCount: number;
  outputBlob: Blob;
  outputName: string;
}

function suffixedName(original: string, suffix = '_masked', overrideExt?: string): string {
  const idx = original.lastIndexOf('.');
  if (idx < 0) return `${original}${suffix}${overrideExt ?? ''}`;
  const base = original.slice(0, idx);
  // 원본 확장자 그대로 (대소문자 포함) — exporter가 동일 형식으로 출력.
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

async function processItem(
  item: QueueItem,
  update: (id: string, patch: Partial<QueueItem>) => void,
): Promise<ProcessOutcome> {
  // 1) 추출
  update(item.id, { status: 'extracting', progress: 5 });
  const parsed = await parseFile(item.file);
  update(item.id, { progress: 35 });

  // 2) 검사 + 마스킹
  // S12 v1: 정규식만 (sidepanel에서 동기 동작). S13+에서 background DETECT_REQUEST로 라우팅
  // 하여 모델 결과까지 합치도록 확장.
  update(item.id, { status: 'detecting', progress: 50 });
  const { maskedMap, totalSpans } = maskSegments(parsed.segments);
  update(item.id, { progress: 80 });

  // 3) 익스포트
  const blob = await exportFile(item.file, maskedMap);
  update(item.id, { progress: 95 });

  return {
    detectedCount: totalSpans,
    outputBlob: blob,
    outputName: shouldFallbackToTxt(item.file)
      ? suffixedName(item.file.name, '_masked', '.txt')
      : suffixedName(item.file.name),
  };
}

export function useFileQueue(): UseFileQueueResult {
  const [items, setItems] = useState<QueueItem[]>([]);
  // 최신 items 스냅샷 — add 내부에서 currentTotal 계산할 때 closure 회피
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const add = useCallback(
    (files: File[]) => {
      // 크기 상한: 이미 큐에 있는 파일 합계 + 신규 파일 합계 ≤ 500MB, 단일 파일 ≤ 100MB
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
        processItem(item, update)
          .then((outcome) => {
            // 자동 다운로드 (브라우저 파일 저장 다이얼로그)
            const url = URL.createObjectURL(outcome.outputBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = outcome.outputName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // revoke은 click 직후 GC 안전한 idle 시점
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            update(item.id, {
              status: 'done',
              progress: 100,
              detectedCount: outcome.detectedCount,
            });
          })
          .catch((err: unknown) => {
            update(item.id, {
              status: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
            });
          });
      }

      return { rejected };
    },
    [update],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, add, remove, clear };
}
