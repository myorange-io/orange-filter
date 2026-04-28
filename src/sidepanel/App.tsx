// 사이드 패널 메인 — 타이틀 → 파일 업로드/큐 → 필터·설정 탭 순서.

import { useEffect, useState } from 'react';
import { Shield, Trash2 } from 'lucide-react';
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

export function App() {
  const queue = useFileQueue();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [newDomain, setNewDomain] = useState('');
  const [activeTab, setActiveTab] = useState<'filter' | 'settings'>('filter');

  useEffect(() => {
    void loadSettings().then(setSettings);
    return subscribeSettings(setSettings);
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
              개인정보를 이 PC 안에서 자동으로 가립니다.
            </p>
            <p className="text-sm text-muted-foreground">
              외부 서버에 전송하지 않습니다.
            </p>
          </div>
        </header>

        {/* 모델 관리 — 헤더 바로 아래 인라인. 사용자가 받기 액션을 즉시 인지하도록 모델 탭은 분리하지 않음. */}
        <section className="mb-6">
          <ModelManager />
        </section>

        <section className="mb-6 space-y-3" aria-label="파일 업로드">
          <FileDropZone
            onAdd={(accepted) => {
              const { rejected } = queue.add(accepted);
              if (rejected.length > 0) {
                const tooLarge = rejected.filter((r) => r.reason === 'file-too-large');
                const queueFull = rejected.filter((r) => r.reason === 'queue-total-exceeded');
                if (tooLarge.length > 0) {
                  toast({
                    title: `파일 용량 초과 (100MB)`,
                    description: `${tooLarge.length}개 파일이 100MB 초과로 제외됐어요. 분할 후 다시 시도해 주세요.`,
                  });
                }
                if (queueFull.length > 0) {
                  toast({
                    title: `큐 총합 한도(500MB) 초과`,
                    description: `${queueFull.length}개 파일이 큐 한도 초과로 제외됐어요. 처리된 파일을 큐에서 제거 후 추가해 주세요.`,
                  });
                }
              }
            }}
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
          onValueChange={(v) => setActiveTab(v as 'filter' | 'settings')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="filter" className="flex-1">
              필터
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

          <TabsContent value="settings" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-1 text-sm font-bold">허용 사이트</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                여기에 등록한 사이트에서는 붙여넣기 알림이 뜨지 않아요.
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
