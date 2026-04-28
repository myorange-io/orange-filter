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
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  '.hwp',
  '.hwpx',
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
