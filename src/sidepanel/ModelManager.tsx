// 모델 관리자 — default 모델 다운로드/캔슬/상태 표시.
// 사용자가 "받기" 버튼 클릭 → background → offscreen이 다운로드 후 IndexedDB 캐시.
// 진행률은 MODEL_DOWNLOAD_PROGRESS broadcast로 받는다.

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Download, X } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';
import { ALL_MODELS, type ModelDefinition, TIER1_DEFAULT } from '@/shared/models';
import type { Message, ModelDownloadProgress, ModelStatus } from '@/shared/messages';

type DownloadState =
  | { phase: 'idle' }
  | { phase: 'downloading'; pct: number; bytesLoaded: number; bytesTotal: number; file?: string }
  | { phase: 'cached' }
  | { phase: 'error'; message: string };

const hasChromeRuntime = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage;

export function ModelManager() {
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>(() => {
    const init: Record<string, DownloadState> = {};
    // 모든 모델은 시작 시 idle. MODEL_STATUS 응답으로 IndexedDB 캐시된 모델만 'cached'로 갱신.
    // 자동 워밍업 없음 — 사용자가 명시적으로 "받기" 클릭해야 다운로드 시작.
    for (const m of ALL_MODELS) init[m.modelId] = { phase: 'idle' };
    return init;
  });
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  // 1) 초기 상태 조회 — offscreen이 IndexedDB enumerate해서 cachedModels 반환
  useEffect(() => {
    if (!hasChromeRuntime()) return;
    const reqId = crypto.randomUUID();
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_STATUS',
        requestId: reqId,
        payload: {
          activeModelId: null,
          cachedModels: [],
          ready: false,
        },
      } satisfies Message)
      .then((resp: ModelStatus | undefined) => {
        if (!resp || resp.kind !== 'MODEL_STATUS') return;
        setActiveModelId(resp.payload.activeModelId);
        setDownloads((prev) => {
          const next = { ...prev };
          for (const id of resp.payload.cachedModels) {
            next[id] = { phase: 'cached' };
          }
          return next;
        });
      })
      .catch(() => {
        /* offscreen 미준비 — 무시 */
      });
  }, []);

  // 2) 진행률 broadcast 수신
  useEffect(() => {
    if (!hasChromeRuntime()) return;
    const handler = (msg: Message) => {
      if (msg.kind !== 'MODEL_DOWNLOAD_PROGRESS') return;
      const p = msg.payload as ModelDownloadProgress['payload'];
      setDownloads((prev) => {
        const next = { ...prev };
        if (p.phase === 'done') {
          next[p.modelId] = { phase: 'cached' };
        } else if (p.phase === 'cancelled') {
          next[p.modelId] = { phase: 'idle' };
        } else if (p.phase === 'error') {
          next[p.modelId] = { phase: 'error', message: '다운로드 실패' };
        } else {
          next[p.modelId] = {
            phase: 'downloading',
            pct: p.pct,
            bytesLoaded: p.bytesLoaded,
            bytesTotal: p.bytesTotal,
            file: p.file,
          };
        }
        return next;
      });
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const startDownload = (def: ModelDefinition) => {
    if (!hasChromeRuntime()) return;
    setDownloads((prev) => ({
      ...prev,
      [def.modelId]: { phase: 'downloading', pct: 0, bytesLoaded: 0, bytesTotal: 0 },
    }));
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_DOWNLOAD_REQUEST',
        requestId: crypto.randomUUID(),
        payload: { modelId: def.modelId },
      } satisfies Message)
      .catch((err: unknown) => {
        setDownloads((prev) => ({
          ...prev,
          [def.modelId]: { phase: 'error', message: String(err) },
        }));
      });
  };

  const cancelDownload = (def: ModelDefinition) => {
    if (!hasChromeRuntime()) return;
    chrome.runtime
      .sendMessage({
        kind: 'MODEL_DOWNLOAD_CANCEL',
        requestId: crypto.randomUUID(),
        payload: { modelId: def.modelId },
      } satisfies Message)
      .catch(() => {
        /* offscreen 미준비 — 무시 */
      });
    // optimistic — 즉시 idle로 바꿔 사용자에게 반응성 보장. 실제 phase는 broadcast로 갱신.
    setDownloads((prev) => ({ ...prev, [def.modelId]: { phase: 'idle' } }));
  };

  const allCached = ALL_MODELS.every(
    (m) => downloads[m.modelId]?.phase === 'cached',
  );

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 text-base font-bold">모델 관리</h2>
      {!allCached && (
        <p className="mb-3 text-xs text-muted-foreground">
          한국어 정밀 보호 모델을 설치해주세요. 지금은 기본 패턴 보호만 동작해요. 모든 처리는 이
          PC 안에서 이뤄집니다.
        </p>
      )}

      <ul className="space-y-3" aria-label="모델 목록">
        {ALL_MODELS.map((def) => {
          const state = downloads[def.modelId] ?? { phase: 'idle' as const };
          const isActive = activeModelId === def.modelId;
          const cached = state.phase === 'cached';
          const downloading = state.phase === 'downloading';

          const showButton = !cached || downloading;
          return (
            <li
              key={def.modelId}
              className="rounded-md border bg-background p-3"
              aria-busy={downloading}
            >
              {/* 사이드패널은 320~500px 좁은 폭이 일반적 — 라벨+버튼 row 강제 시
                  좁은 폭에서 라벨이 글자 단위로 줄바꿈됨. 본문(아이콘+텍스트) 위,
                  버튼 아래로 분리해 모든 폭에서 안정. */}
              <div className="flex items-start gap-2">
                <div className="mt-0.5">
                  {cached ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-label="설치됨" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" aria-label="미설치" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-bold">{def.labelKo}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums break-all">
                      {def.modelId.split('/').pop()}
                    </span>
                    {isActive && cached && <Badge>활성</Badge>}
                    {!def.shippable && <Badge variant="outline">준비중</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{def.descriptionKo}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    약 {def.approxDownloadMB}MB
                  </p>

                  {downloading && (
                    <div className="mt-2 space-y-1">
                      <Progress value={state.pct} aria-label="설치 진행률" />
                      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                        <span>{Math.round(state.pct)}%</span>
                        <span>{state.file ?? '설치 중'}</span>
                      </div>
                    </div>
                  )}

                  {state.phase === 'error' && (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {state.message} — 잠시 뒤 다시 시도해 주세요.
                    </p>
                  )}
                </div>
              </div>

              {showButton && (
                <div className="mt-3 flex justify-end gap-1">
                  {!cached && !downloading && (
                    <Button
                      size="default"
                      onClick={() => startDownload(def)}
                      disabled={!def.shippable}
                      aria-label={`${def.labelKo} 설치 시작`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      설치하기
                    </Button>
                  )}
                  {downloading && (
                    <Button
                      size="default"
                      variant="outline"
                      onClick={() => cancelDownload(def)}
                      aria-label={`${def.labelKo} 설치 취소`}
                    >
                      <X className="h-3.5 w-3.5" />
                      취소
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!allCached && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          설치하면 한국어 사람 이름·주소·조직명도 정밀하게 보호해요. 지금은 주민등록번호·전화·계좌·카드 등
          정해진 패턴만 자동으로 보호합니다.
        </p>
      )}
    </section>
  );
}
