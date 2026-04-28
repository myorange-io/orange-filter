// 파일 드롭존 — drag-over highlight + drop 처리 + click-to-select fallback.
// 지원 확장자만 onAdd 호출, 미지원은 onReject.

import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { isSupported, SUPPORTED_EXTENSIONS } from './file-queue';

export interface FileDropZoneProps {
  onAdd: (files: File[]) => void;
  onReject?: (files: File[]) => void;
  className?: string;
}

export function FileDropZone({ onAdd, onReject, className }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const split = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      const ok = files.filter(isSupported);
      const rejected = files.filter((f) => !isSupported(f));
      if (ok.length) onAdd(ok);
      if (rejected.length && onReject) onReject(rejected);
    },
    [onAdd, onReject],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          'block w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          dragOver
            ? 'border-primary bg-accent/50'
            : 'border-border hover:bg-muted/40 hover:border-primary/40',
          className,
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length === 0) return;
          split(e.dataTransfer.files);
        }}
        aria-label="파일을 끌어다 놓거나 클릭해서 선택"
      >
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">파일을 끌어다 놓거나 </span>
          <span className="text-primary underline underline-offset-2 font-medium">
            클릭해서 선택
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {SUPPORTED_EXTENSIONS.map((e) => e.replace('.', '').toUpperCase()).join(' · ')}
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={SUPPORTED_EXTENSIONS.join(',')}
        className="sr-only"
        onChange={(e) => {
          if (!e.target.files) return;
          split(e.target.files);
          e.target.value = ''; // 같은 파일 재선택 가능하도록
        }}
      />
    </>
  );
}
