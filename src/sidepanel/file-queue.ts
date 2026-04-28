// 파일 큐 모델 — sidepanel에서 드롭된 파일들의 lifecycle을 추적.
// S12에서 parsers/{pdf,docx,xlsx,csv,txt,hwp,hwpx} 어댑터가 채울 자리.

export type FileStatus = 'queued' | 'extracting' | 'detecting' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  /** 0-100, 단계별 누적 (extract 0-50, detect 50-100) */
  progress: number;
  errorMessage?: string;
  /** 추출 결과 텍스트 (S12에서 채움) */
  extractedText?: string;
  /** 발견된 PII span 수 (S12+에서 채움) */
  detectedCount?: number;
}

export const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  '.hwp',
  '.hwpx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
] as const;

export function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function fileExtension(file: File): string {
  const name = file.name.toLowerCase();
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

// 크기 상한 (Threat Model §5 #3) — OOM/ReDoS 1차 방어.
// xlsx ReDoS 취약점(no fix) mitigation 포함.
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_QUEUE_TOTAL_BYTES = 500 * 1024 * 1024; // 500MB

export interface SizeRejectReason {
  file: File;
  reason: 'file-too-large' | 'queue-total-exceeded';
  limit: number;
}

/**
 * 큐 추가 가능한 파일과 거부된 파일을 분리. 거부 사유 함께 반환.
 * `currentTotalBytes`는 이미 큐에 있는 파일들의 합계 (호출자가 계산).
 */
export function partitionBySize(
  files: ReadonlyArray<File>,
  currentTotalBytes = 0,
): { accepted: File[]; rejected: SizeRejectReason[] } {
  const accepted: File[] = [];
  const rejected: SizeRejectReason[] = [];
  let runningTotal = currentTotalBytes;
  for (const f of files) {
    if (f.size > MAX_FILE_SIZE_BYTES) {
      rejected.push({ file: f, reason: 'file-too-large', limit: MAX_FILE_SIZE_BYTES });
      continue;
    }
    if (runningTotal + f.size > MAX_QUEUE_TOTAL_BYTES) {
      rejected.push({
        file: f,
        reason: 'queue-total-exceeded',
        limit: MAX_QUEUE_TOTAL_BYTES,
      });
      continue;
    }
    accepted.push(f);
    runningTotal += f.size;
  }
  return { accepted, rejected };
}

export function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0) + 'MB';
}
