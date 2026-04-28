// 사이드 패널 메인 — 타이틀 → 파일 업로드/큐 → 필터·설정 탭 순서.

import { useEffect, useState } from 'react';
import { AlertTriangle, Shield, Trash2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CategoryToggleList } from '@/shared/ui/CategoryToggleList';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Toaster } from '@/shared/ui/toaster';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { useToast } from '@/shared/ui/use-toast';
import { CATEGORY_ORDER } from '@/background/pii/categories';
import { TIER1_DEFAULT } from '@/shared/models';
import type { Message, ModelStatus } from '@/shared/messages';
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from '@/shared/settings';
import type { MaskMode, PIICategory } from '@/shared/types';
import { FileDropZone } from './FileDropZone';
import { FileQueueList } from './FileQueueList';
import { ModelManager } from './ModelManager';
import { useFileQueue } from './use-file-queue';

const MODEL_CACHED_KEY = 'oi-filter-model-cached-v1';

function readCachedFlag(): boolean {
  try {
    return window.localStorage?.getItem(MODEL_CACHED_KEY) === TIER1_DEFAULT.modelId;
  } catch {
    return false;
  }
}

export function App() {
  const queue = useFileQueue();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [newDomain, setNewDomain] = useState('');
  const [activeTab, setActiveTab] = useState<'filter' | 'models' | 'settings'>('filter');
  const [modelCached, setModelCached] = useState<boolean>(() => readCachedFlag());

  useEffect(() => {
    void loadSettings().then(setSettings);
    return subscribeSettings(setSettings);
  }, []);

  // 모델 캐시 상태 — chrome.runtime이 있으면 MODEL_STATUS query, 없으면 localStorage 마커.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    const reqId = crypto.randomUUID();
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_STATUS',
        requestId: reqId,
        payload: { activeModelId: null, cachedModels: [], ready: false },
      } satisfies Message)
      .then((resp: ModelStatus | undefined) => {
        if (resp?.kind === 'MODEL_STATUS') {
          const cached = resp.payload.cachedModels.includes(TIER1_DEFAULT.modelId);
          setModelCached(cached);
          if (cached) {
            try {
              window.localStorage?.setItem(MODEL_CACHED_KEY, TIER1_DEFAULT.modelId);
            } catch {
              /* private mode */
            }
          }
        }
      })
      .catch(() => {
        /* offscreen 미준비 — localStorage 마커로 fallback */
      });
    // 다운로드 완료 broadcast listen — ModelManager가 받기 누른 후
    const handler = (msg: Message) => {
      if (msg.kind === 'MODEL_DOWNLOAD_PROGRESS' && msg.payload.modelId === TIER1_DEFAULT.modelId) {
        if (msg.payload.phase === 'done') {
          setModelCached(true);
          try {
            window.localStorage?.setItem(MODEL_CACHED_KEY, TIER1_DEFAULT.modelId);
          } catch {
            /* skip */
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const persist = (next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  };

  const setEnabled = (cat: PIICategory, enabled: boolean) =>
    persist({
      ...settings,
      enabledByCategory: { ...settings.enabledByCategory, [cat]: enabled },
    });

  const setMode = (cat: PIICategory, mode: MaskMode) =>
    persist({
      ...settings,
      modeByCategory: { ...settings.modeByCategory, [cat]: mode },
    });

  const addDomain = () => {
    const trimmed = newDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*/, '');
    if (!trimmed) return;
    if (settings.whitelistedDomains.includes(trimmed)) {
      toast({ title: '이미 추가된 도메인' });
      return;
    }
    persist({ ...settings, whitelistedDomains: [...settings.whitelistedDomains, trimmed] });
    setNewDomain('');
  };

  const removeDomain = (d: string) => {
    persist({
      ...settings,
      whitelistedDomains: settings.whitelistedDomains.filter((x) => x !== d),
    });
  };

  const enabledCount = CATEGORY_ORDER.filter(
    (c) => settings.enabledByCategory[c] ?? false,
  ).length;

  return (
    <TooltipProvider>
      <main className="min-h-screen p-6">
        <header className="mb-6 flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" aria-hidden />
          <div className="flex-1">
            <h1 className="text-xl font-bold">오렌지 필터</h1>
            <p className="text-sm text-muted-foreground">
              개인정보를 이 PC 안에서 자동으로 가립니다. 외부 서버에 전송하지 않습니다.
            </p>
          </div>
        </header>

        {/* 모델 미다운로드 — 사용 전 받기 유도 (Peak-End: 첫 인상에서 가치를 명확히) */}
        {!modelCached && (
          <section
            className="mb-6 rounded-lg border-2 border-primary bg-primary/5 p-4"
            role="status"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div className="flex-1">
                <h2 className="text-sm font-bold">한국어 NER 모델을 먼저 받아주세요</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  받기 전에는 정규식 기반 기본 보호만 동작합니다. 약 50MB · 한 번만 받으면 오프라인에서도 동작.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setActiveTab('models')}
                  aria-label="모델 탭으로 이동해서 다운로드"
                >
                  모델 받으러 가기
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Peak-End 카운터 — confirm 직후 storage onChanged로 즉시 반영. 0건일 땐 숨김. */}
        {settings.stats.totalSpansMasked > 0 && (
          <section
            className="mb-6 rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-4"
            aria-label="누적 보호 통계"
            aria-live="polite"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-primary">
                {settings.stats.totalSpansMasked.toLocaleString('ko-KR')}
              </span>
              <span className="text-sm text-muted-foreground">
                건의 개인정보를 이 PC가 지켜냈어요
              </span>
            </div>
          </section>
        )}

        <section className="mb-6 space-y-3" aria-label="파일 업로드">
          <FileDropZone
            onAdd={queue.add}
            onReject={(files) => {
              toast({
                title: '지원하지 않는 파일',
                description: `${files.length}개 파일이 제외됐습니다.`,
              });
            }}
          />
          <FileQueueList items={queue.items} onRemove={queue.remove} />
          {queue.items.length > 0 && (
            <button
              type="button"
              onClick={queue.clear}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              큐 비우기
            </button>
          )}
        </section>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'filter' | 'models' | 'settings')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="filter" className="flex-1">
              필터
            </TabsTrigger>
            <TabsTrigger value="models" className="flex-1">
              모델
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">
              설정
            </TabsTrigger>
          </TabsList>

          <TabsContent value="filter" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">민감정보 카테고리</h2>
                <Badge variant="accent">
                  {enabledCount}/{CATEGORY_ORDER.length} ON
                </Badge>
              </div>
              <CategoryToggleList
                enabledByCategory={settings.enabledByCategory}
                modeByCategory={settings.modeByCategory}
                onToggle={setEnabled}
                onModeChange={setMode}
              />
            </section>
          </TabsContent>

          <TabsContent value="models" className="space-y-4">
            <ModelManager />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-1 text-sm font-bold">화이트리스트 도메인</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                여기에 등록한 도메인에서는 paste 모달이 뜨지 않습니다.
              </p>
              <div className="flex gap-2">
                <Label htmlFor="wl-input" className="sr-only">
                  도메인
                </Label>
                <Input
                  id="wl-input"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDomain();
                  }}
                />
                <Button onClick={addDomain}>추가</Button>
              </div>
              {settings.whitelistedDomains.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {settings.whitelistedDomains.map((d) => (
                    <li
                      key={d}
                      className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2"
                    >
                      <span className="text-sm">{d}</span>
                      <button
                        type="button"
                        onClick={() => removeDomain(d)}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`${d} 제거`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>

        <p className="mt-6 text-xs text-muted-foreground">
          모든 처리는 이 PC 안에서 이뤄집니다.
        </p>
      </main>
      <Toaster />
    </TooltipProvider>
  );
}
