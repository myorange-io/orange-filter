// 파일 큐 모델 — sidepanel에서 드롭된 파일들의 lifecycle을 추적.
// S12에서 parsers/{pdf,docx,xlsx,csv,txt,hwp,hwpx} 어댑터가 채울 자리.
// v1.4: 'reviewing'/'masking' 상태 추가 — detect 후 사용자 검토 → confirm 시 mask·export.

import type { ParseResult } from './parsers/types';
import type { PIISpan } from '@/shared/types';

export type FileStatus =
  | 'queued'
  | 'extracting'
  | 'detecting'
  | 'reviewing'
  | 'masking'
  | 'done'
  | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  /** 0-100, 단계별 누적 (extract 0-35, detect 35-80, mask/export 80-100) */
  progress: number;
  errorMessage?: string;
  /** 추출 결과 텍스트 (S12에서 채움) */
  extractedText?: string;
  /** 발견된 PII span 수 (검토 단계 시 사용 + 완료 시 적용 건수와 별도) */
  detectedCount?: number;
  /** 사용자가 실제로 적용한 마스킹 건수 (done 상태에서만 의미). detectedCount와 다를 수 있음 */
  appliedCount?: number;
  /** detect 결과 보관 — 검토 모달에서 사용. 'reviewing' 상태에서 채워짐. */
  parsed?: ParseResult;
  spansBySegment?: Map<string, PIISpan[]>;
  /** 사용자 토글 상태 — undefined면 '모든 span ON' 으로 간주 */
  enabledSpanKeys?: Set<string>;
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
