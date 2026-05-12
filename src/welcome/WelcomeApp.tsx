// 첫 설치 직후 자동으로 열리는 환영 탭.
// 사용자가 "다운로드해야 하는 AI 모델이 있다"는 사실을 1초 안에 인지하고,
// 클릭 한 번으로 사이드패널 GateScreen 흐름에 진입하도록 안내한다.
//
// 모델 다운로드 자체는 GateScreen에서 트리거한다 (진행률/취소/이어받기 UI 중복 방지).

import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { TIER1_DEFAULT } from '@/shared/models';

const hasChromeRuntime = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.id;

export function WelcomeApp() {
  const onStart = async () => {
    if (!hasChromeRuntime()) return;
    try {
      const win = await chrome.windows.getCurrent();
      // sidePanel.open()은 사용자 제스처가 필요한데, 이 클릭이 곧 그 제스처.
      if (win.id != null) await chrome.sidePanel.open({ windowId: win.id });
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id != null) await chrome.tabs.remove(tab.id);
    } catch {
      // 구버전 Chrome 등 — 보조 안내(아래 텍스트)로 사용자가 우회 가능.
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex justify-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent">
            <ShieldCheck className="h-12 w-12 text-primary" aria-hidden />
          </div>
        </div>

        <h1 className="mb-3 text-center text-3xl font-bold leading-tight">
          Orange Filter 설치 완료
        </h1>
        <p className="mb-10 text-center text-base leading-relaxed text-muted-foreground">
          ChatGPT·Claude·Gemini에 붙여넣기 전,
          <br />
          개인정보를 이 PC 안에서 자동으로 가려 드립니다.
        </p>

        <div className="mb-8 rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 text-sm font-semibold text-foreground">
            시작하기 전에 한 번만 — AI 모델 설치
          </div>
          <ul className="space-y-3">
            <ValueCheck>
              <b className="font-semibold">처음 한 번만</b> 설치하면 됩니다
              <span className="ml-1 text-muted-foreground">
                ({TIER1_DEFAULT.approxDownloadMB} MB)
              </span>
            </ValueCheck>
            <ValueCheck>
              설치한 뒤엔 <b className="font-semibold">인터넷 없이도</b> 동작합니다
            </ValueCheck>
            <ValueCheck>
              파일이 <b className="font-semibold">외부 서버로 전송되지 않습니다</b>
            </ValueCheck>
          </ul>
        </div>

        <Button
          onClick={onStart}
          className="mb-4 h-12 w-full text-[15px] font-semibold"
        >
          시작하기 — 사이드 패널 열기
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>

        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          또는 브라우저 우측 상단의{' '}
          <b className="font-semibold text-foreground">Orange Filter</b> 아이콘을
          클릭해도 됩니다.
        </p>
      </div>
    </main>
  );
}

function ValueCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
      </div>
      <span className="text-sm leading-snug">{children}</span>
    </li>
  );
}
