// 1.5초 hold 제스처 버튼 — 실수로 우회하는 일을 막기 위한 UX (per-paste override).
// pointer down 시 진행률 표시, 완료(=hold 충족) 시 onConfirm 호출.

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';

export interface HoldButtonProps {
  onConfirm: () => void;
  /** ms */
  durationMs?: number;
  children: React.ReactNode;
  className?: string;
}

const DEFAULT_DURATION = 1500;

export function HoldButton({ onConfirm, durationMs = DEFAULT_DURATION, children, className }: HoldButtonProps) {
  const [progress, setProgress] = useState(0); // 0..1
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    startRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(elapsed / durationMs, 1);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, onConfirm, stop]);

  const start = useCallback(() => {
    if (startRef.current !== null) return;
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return (
    <button
      type="button"
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      aria-label="1.5초 누르고 있으면 마스킹 없이 그대로 붙여넣기"
    >
      <span
        className="absolute inset-y-0 left-0 bg-primary/20 transition-[width]"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <span className="relative">{children}</span>
    </button>
  );
}
