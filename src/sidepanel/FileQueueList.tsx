// 큐 아이템 리스트 — 파일별 진행률 + 상태 칩 + 삭제 버튼.

import { AlertCircle, CheckCircle2, FileText, Loader2, X } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';
import type { FileStatus, QueueItem } from './file-queue';

const STATUS_LABEL: Record<FileStatus, string> = {
  queued: '대기',
  extracting: '추출 중',
  detecting: '검사 중',
  done: '완료',
  error: '실패',
};

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />;
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />;
  if (status === 'queued') return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />;
  return <Loader2 className="h-4 w-4 animate-spin text-secondary" aria-hidden />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface FileQueueListProps {
  items: ReadonlyArray<QueueItem>;
  onRemove: (id: string) => void;
}

export function FileQueueList({ items, onRemove }: FileQueueListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="파일 처리 목록">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-md border bg-card p-3"
          aria-label={`${item.file.name} ${STATUS_LABEL[item.status]}`}
        >
          <div className="flex items-center gap-2">
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.file.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(item.file.size)}
                {typeof item.detectedCount === 'number' && item.status === 'done' && (
                  <> · 발견 {item.detectedCount}건</>
                )}
              </div>
            </div>
            <Badge
              variant={item.status === 'error' ? 'destructive' : item.status === 'done' ? 'accent' : 'outline'}
            >
              {STATUS_LABEL[item.status]}
            </Badge>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`${item.file.name} 큐에서 제거`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {item.status !== 'done' && item.status !== 'error' && (
            <Progress value={item.progress} className="mt-2 h-1.5" />
          )}
          {item.status === 'error' && item.errorMessage && (
            <p className="mt-2 text-xs text-destructive">{item.errorMessage}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
