// MV3 4-context (background SW / content / offscreen / sidepanel) 메시지 프로토콜.
// 모든 메시지는 `requestId`를 가지고, 응답은 `inResponseTo`로 매핑.

import type { DetectResult, MaskMode, PIICategory } from '@/shared/types';

export type MessageKind =
  | 'PING'
  | 'DETECT_REQUEST'
  | 'DETECT_PROGRESS'
  | 'DETECT_RESULT'
  | 'MASK_REQUEST'
  | 'MASK_RESULT'
  | 'MODEL_STATUS'
  | 'MODEL_DOWNLOAD_PROGRESS'
  | 'OFFSCREEN_READY'
  | 'ERROR';

interface MessageBase<K extends MessageKind, P> {
  kind: K;
  requestId: string;
  inResponseTo?: string;
  payload: P;
}

export type DetectRequest = MessageBase<
  'DETECT_REQUEST',
  {
    text: string;
    /** 모드. 라우터가 모델 선택에 사용 */
    userMode?: 'default' | 'multilingual' | 'precision_high';
  }
>;

export type DetectProgress = MessageBase<
  'DETECT_PROGRESS',
  { stage: 'regex' | 'model_load' | 'model_infer'; pct: number }
>;

export type DetectResultMsg = MessageBase<'DETECT_RESULT', DetectResult>;

export type MaskRequest = MessageBase<
  'MASK_REQUEST',
  {
    text: string;
    detectResult: DetectResult;
    modeByCategory?: Partial<Record<PIICategory, MaskMode>>;
    enabledByCategory?: Partial<Record<PIICategory, boolean>>;
    enabledSpanKeys?: ReadonlyArray<string>;
  }
>;

export type MaskResultMsg = MessageBase<
  'MASK_RESULT',
  { text: string; appliedCount: number; skippedCount: number }
>;

export type ModelStatus = MessageBase<
  'MODEL_STATUS',
  {
    activeModelId: string | null;
    cachedModels: ReadonlyArray<string>;
    ready: boolean;
  }
>;

export type ModelDownloadProgress = MessageBase<
  'MODEL_DOWNLOAD_PROGRESS',
  { modelId: string; pct: number; bytesLoaded: number; bytesTotal: number }
>;

export type Ping = MessageBase<'PING', null>;
export type OffscreenReady = MessageBase<'OFFSCREEN_READY', null>;
export type ErrorMsg = MessageBase<
  'ERROR',
  { code: string; message: string; cause?: unknown }
>;

export type Message =
  | DetectRequest
  | DetectProgress
  | DetectResultMsg
  | MaskRequest
  | MaskResultMsg
  | ModelStatus
  | ModelDownloadProgress
  | Ping
  | OffscreenReady
  | ErrorMsg;

export function makeRequestId(): string {
  // crypto.randomUUID는 SW/Content/Offscreen 모두에서 사용 가능
  return crypto.randomUUID();
}
