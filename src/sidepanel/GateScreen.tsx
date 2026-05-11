// 모델 설치 게이트 — 사이드 패널 첫 진입 시 모델 미설치면 입력 UI 대신 표시.
// 시안 docs/ux-gate-mockup.html 화면 1·2·4 (welcome / downloading / error)에 1:1 대응.
//
// 흐름: welcome → "AI 모델 설치하기" → downloading (진행률 + 이어받기 안심) → 완료 시
// onReady 콜백 → 메인 App으로 전환. 다운로드 실패 시 error 화면(이어 설치 / 처음부터).
//
// 모델 다운로드 IPC는 ModelManager와 동일 경로. 사이드패널의 첫 화면이라 동일 IPC를
// 다른 UI로 보여줄 뿐.

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';
import { TIER1_DEFAULT } from '@/shared/models';
import type { Message, ModelDownloadProgress, ModelStatus } from '@/shared/messages';

const hasChromeRuntime = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

type Phase = 'welcome' | 'downloading' | 'error';

interface DownloadState {
  pct: number;
  bytesLoaded: number;
  bytesTotal: number;
}

interface GateScreenProps {
  onReady: () => void;
}

export function GateScreen({ onReady }: GateScreenProps) {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [progress, setProgress] = useState<DownloadState>({
    pct: 0,
    bytesLoaded: 0,
    bytesTotal: 0,
  });

  // 진행률 broadcast 수신
  useEffect(() => {
    if (!hasChromeRuntime()) return;
    const handler = (msg: Message) => {
      if (msg.kind !== 'MODEL_DOWNLOAD_PROGRESS') return;
      const p = msg.payload as ModelDownloadProgress['payload'];
      if (p.modelId !== TIER1_DEFAULT.modelId) return;
      if (p.phase === 'done') {
        onReady();
      } else if (p.phase === 'cancelled') {
        setPhase('welcome');
      } else if (p.phase === 'error') {
        setPhase('error');
      } else {
        setPhase('downloading');
        setProgress({
          pct: p.pct,
          bytesLoaded: p.bytesLoaded,
          bytesTotal: p.bytesTotal,
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [onReady]);

  const startDownload = () => {
    if (!hasChromeRuntime()) {
      setPhase('error');
      return;
    }
    setPhase('downloading');
    setProgress({ pct: 0, bytesLoaded: 0, bytesTotal: 0 });
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_DOWNLOAD_REQUEST',
        requestId: crypto.randomUUID(),
        payload: { modelId: TIER1_DEFAULT.modelId },
      } satisfies Message)
      .catch(() => setPhase('error'));
  };

  const cancelDownload = () => {
    if (!hasChromeRuntime()) return;
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_DOWNLOAD_CANCEL',
        requestId: crypto.randomUUID(),
        payload: { modelId: TIER1_DEFAULT.modelId },
      } satisfies Message)
      .catch(() => {
        /* offscreen 미준비 — 무시 */
      });
    setPhase('welcome');
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex h-11 items-center gap-2 border-b border-border px-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        </div>
        <div className="text-sm font-bold">Orange Filter</div>
      </header>

      <div className="flex-1 px-5 py-6">
        {phase === 'welcome' && <WelcomePane onStart={startDownload} />}
        {phase === 'downloading' && (
          <DownloadingPane progress={progress} onCancel={cancelDownload} />
        )}
        {phase === 'error' && (
          <ErrorPane progress={progress} onRetry={startDownload} />
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-border px-3 text-[11px] text-muted-foreground">
        {phase === 'welcome' && <FooterStatus label={`AI 모델: ${TIER1_DEFAULT.modelId}`} />}
        {phase === 'downloading' && (
          <FooterStatus
            dotClass="bg-primary"
            pulse
            label="설치 중"
          />
        )}
        {phase === 'error' && (
          <FooterStatus dotClass="bg-destructive" label="설치 중단됨" />
        )}
        <span>v1.2.0</span>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 화면 1 — Welcome (시안 docs/ux-gate-mockup.html#1)
// ---------------------------------------------------------------------------

function WelcomePane({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent">
          <ShieldCheck className="h-9 w-9 text-primary" aria-hidden />
        </div>
      </div>

      <h2 className="mb-2 text-center text-[20px] font-bold leading-snug">
        한 번만 설치하면 됩니다
      </h2>
      <p className="mb-7 px-1 text-center text-[13.5px] leading-relaxed text-muted-foreground">
        개인정보를 AI가 정확하게 찾아내 가립니다
      </p>

      <ul className="mb-8 space-y-3">
        <ValueCheck>
          <b className="font-semibold">처음 한 번만</b> 설치하면 됩니다
        </ValueCheck>
        <ValueCheck>
          설치한 뒤엔 <b className="font-semibold">인터넷 없이도</b> 동작합니다
        </ValueCheck>
        <ValueCheck>
          파일이 <b className="font-semibold">외부 서버로 전송되지 않습니다</b>
        </ValueCheck>
      </ul>

      <Button
        onClick={onStart}
        className="mb-3 h-12 w-full text-[15px] font-semibold"
      >
        <Download className="mr-1 h-4 w-4" />
        AI 모델 설치하기 (약 {TIER1_DEFAULT.approxDownloadMB} MB)
      </Button>
    </div>
  );
}

function ValueCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
      </div>
      <span className="text-[13.5px] leading-snug">{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 화면 2 — Downloading (시안 #2)
// ---------------------------------------------------------------------------

function DownloadingPane({
  progress,
  onCancel,
}: {
  progress: DownloadState;
  onCancel: () => void;
}) {
  const totalMB = progress.bytesTotal > 0 ? progress.bytesTotal / 1_048_576 : 50;
  const loadedMB = progress.bytesLoaded > 0 ? progress.bytesLoaded / 1_048_576 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="mb-6 mt-4 flex justify-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent">
          <Download className="h-7 w-7 text-primary" aria-hidden />
          <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-primary" />
        </div>
      </div>

      <h2 className="mb-1 text-center text-[18px] font-bold">AI 모델 설치하는 중</h2>
      <p className="mb-6 text-center text-[12.5px] text-muted-foreground">잠시만 기다려 주세요</p>

      <div className="mb-2">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13px] font-medium tabular-nums">{Math.round(progress.pct)}%</span>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {loadedMB.toFixed(0)} / {totalMB.toFixed(0)} MB
          </span>
        </div>
        <Progress value={progress.pct} aria-label="설치 진행률" />
      </div>

      <div className="flex-1" />

      <div className="mb-5 flex gap-2.5 rounded-xl border border-blue-100 bg-blue-50 p-3.5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden />
        <div className="text-[12.5px] leading-relaxed">
          네트워크가 끊겨도 여기까지 진행한 만큼은 저장돼서{' '}
          <b className="font-semibold">다음에 이어서 설치할 수 있어요.</b>
        </div>
      </div>

      <Button variant="outline" onClick={onCancel} className="h-10 w-full">
        취소
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 화면 4 — Error (시안 #4)
// ---------------------------------------------------------------------------

function ErrorPane({
  progress,
  onRetry,
}: {
  progress: DownloadState;
  onRetry: () => void;
}) {
  const loadedMB = progress.bytesLoaded > 0 ? progress.bytesLoaded / 1_048_576 : 0;
  const hasResume = loadedMB > 0;

  return (
    <div>
      <div className="mb-6 mt-2 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden />
        </div>
      </div>

      <h2 className="mb-2 text-center text-[19px] font-bold">설치에 실패했어요</h2>
      <p className="mb-6 px-2 text-center text-[13.5px] leading-relaxed text-muted-foreground">
        네트워크가 잠시 끊겼거나
        <br />
        디스크 공간이 부족할 수 있어요
      </p>

      {hasResume && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 p-3.5">
          <RotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden />
          <div className="text-[12.5px] leading-relaxed">
            여기까지 진행한 <b className="font-semibold">{loadedMB.toFixed(0)} MB는 저장돼 있어요.</b>
            <br />
            이어서 설치하면 됩니다.
          </div>
        </div>
      )}

      <Button onClick={onRetry} className="mb-2.5 h-11 w-full">
        <RotateCcw className="mr-1 h-4 w-4" />
        {hasResume ? '이어서 설치하기' : '다시 시도'}
      </Button>
      {hasResume && (
        <Button variant="outline" onClick={onRetry} className="mb-4 h-10 w-full">
          처음부터 다시 설치하기
        </Button>
      )}

      <details className="text-center">
        <summary className="cursor-pointer list-none text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
          계속 실패하나요? <span className="text-muted-foreground">▾</span>
        </summary>
        <div className="mt-3 rounded-xl bg-muted p-3.5 text-left text-[12px] leading-relaxed text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">회사 방화벽이 차단할 수 있어요</div>
          huggingface.co 도메인을 IT 관리자에게 허용 요청하거나, 모델 파일을 직접
          가져와서 설치하기로 우회할 수 있어요.
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer status pill
// ---------------------------------------------------------------------------

function FooterStatus({
  dotClass,
  pulse,
  label,
}: {
  dotClass?: string;
  pulse?: boolean;
  label: string;
}) {
  if (!dotClass) {
    return <span className="truncate text-[11px]">{label}</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass} ${pulse ? 'animate-pulse' : ''}`}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 모델 cached 여부 — App.tsx 분기에서 사용
// ---------------------------------------------------------------------------

export function useModelCached(): { cached: boolean; checked: boolean } {
  const [state, setState] = useState({ cached: false, checked: false });

  useEffect(() => {
    if (!hasChromeRuntime()) {
      setState({ cached: false, checked: true });
      return;
    }
    const reqId = crypto.randomUUID();
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_STATUS',
        requestId: reqId,
        payload: { activeModelId: null, cachedModels: [], ready: false },
      } satisfies Message)
      .then((resp: ModelStatus | undefined) => {
        if (!resp || resp.kind !== 'MODEL_STATUS') {
          setState({ cached: false, checked: true });
          return;
        }
        const cached = resp.payload.cachedModels.includes(TIER1_DEFAULT.modelId);
        setState({ cached, checked: true });
      })
      .catch(() => setState({ cached: false, checked: true }));

    // 다운로드 완료/취소를 함께 듣고 갱신.
    const handler = (msg: Message) => {
      if (msg.kind !== 'MODEL_DOWNLOAD_PROGRESS') return;
      const p = msg.payload as ModelDownloadProgress['payload'];
      if (p.modelId !== TIER1_DEFAULT.modelId) return;
      if (p.phase === 'done') setState({ cached: true, checked: true });
      else if (p.phase === 'cancelled') setState((s) => ({ ...s, cached: false }));
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  return state;
}
