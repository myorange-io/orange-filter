// 사용자 설정 — chrome.storage.local에 저장. 비-확장 환경(test page, vite dev)에서는
// localStorage로 폴백. 모든 변경은 chrome.storage.onChanged 또는 storage 이벤트로 전파.

import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import type { MaskMode, PIICategory } from './types';

export type ThemeMode = 'light' | 'dark';

export interface Settings {
  /** 카테고리별 마스킹 활성화 */
  enabledByCategory: Partial<Record<PIICategory, boolean>>;
  /** 카테고리별 마스킹 모드 */
  modeByCategory: Partial<Record<PIICategory, MaskMode>>;
  /** 화이트리스트 도메인 — 어댑터가 paste 가로채지 않음 */
  whitelistedDomains: ReadonlyArray<string>;
  /** 사용자 모드 (라우터로 전달) */
  userMode: 'default' | 'multilingual' | 'precision_high';
  /** Peak-End 카운터 — 누적 마스킹 통계. 사용자가 보호받았다는 감각을 강화. */
  stats: Stats;
  /** UI 테마 — 사용자 명시 선택. 기본 'light' (OS prefers-color-scheme 무시). */
  theme: ThemeMode;
  /**
   * true면 파일 업로드 시 검토 단계 없이 자동으로 마스킹·다운로드 (기존 v1.3 동작).
   * 기본 false: 사용자가 어떤 PII가 가려질지 모달에서 확인 후 다운로드.
   */
  autoApplyMaskWithoutReview: boolean;
}

export interface Stats {
  /** paste 마스킹을 사용자가 confirm한 횟수 (override 차감) */
  totalConfirmed: number;
  /** 실제 가려진 span 누적 — "이만큼 보호됐어요" 표시용 */
  totalSpansMasked: number;
  /** 마지막 confirm 시각 — ISO string */
  lastConfirmedAt: string | null;
}

const defaultStats = (): Stats => ({
  totalConfirmed: 0,
  totalSpansMasked: 0,
  lastConfirmedAt: null,
});

const STORAGE_KEY = 'oi-filter-settings-v1';

export function defaultSettings(): Settings {
  const enabled: Partial<Record<PIICategory, boolean>> = {};
  const mode: Partial<Record<PIICategory, MaskMode>> = {};
  for (const id of CATEGORY_ORDER) {
    enabled[id] = CATEGORIES[id].defaultEnabled;
    mode[id] = CATEGORIES[id].defaultMaskMode;
  }
  return {
    enabledByCategory: enabled,
    modeByCategory: mode,
    whitelistedDomains: [],
    userMode: 'default',
    stats: defaultStats(),
    theme: 'light',
    autoApplyMaskWithoutReview: false,
  };
}

const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.storage?.local;

/**
 * 확장 reload 후 이미 주입된 content script가 chrome.* API를 호출하면
 * "Extension context invalidated" 오류 throw. 사용자 새로 고침으로 해결되는
 * 일시적 상태이므로 silent fallback (localStorage)으로 처리해 unhandled
 * rejection 노이즈를 막는다.
 */
function isExtensionContextInvalidated(err: unknown): boolean {
  return (
    err instanceof Error &&
    /Extension context invalidated|context invalidated/i.test(err.message)
  );
}

function mergeWithDefaults(raw: Partial<Settings> | undefined): Settings {
  const base = defaultSettings();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    // stats는 누적이므로 기본값과 raw를 안전하게 병합 (구버전 사용자 호환)
    stats: { ...base.stats, ...(raw.stats ?? {}) },
  };
}

export async function loadSettings(): Promise<Settings> {
  if (hasChromeStorage()) {
    try {
      const obj = await chrome.storage.local.get(STORAGE_KEY);
      return mergeWithDefaults(obj[STORAGE_KEY] as Partial<Settings> | undefined);
    } catch (err) {
      if (!isExtensionContextInvalidated(err)) throw err;
      // Fall through to localStorage fallback
    }
  }
  try {
    const json = window.localStorage?.getItem(STORAGE_KEY);
    if (!json) return defaultSettings();
    return mergeWithDefaults(JSON.parse(json) as Partial<Settings>);
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  if (hasChromeStorage()) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      return;
    } catch (err) {
      if (!isExtensionContextInvalidated(err)) throw err;
      // Fall through — localStorage fallback so the value survives the page session
    }
  }
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode 등 — 무시 */
  }
}

export type SettingsListener = (next: Settings) => void;

/** 변경 구독. unsubscribe 함수 반환. */
export function subscribeSettings(listener: SettingsListener): () => void {
  if (hasChromeStorage()) {
    try {
      const handler = (
        changes: { [key: string]: chrome.storage.StorageChange },
        area: string,
      ) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        listener(mergeWithDefaults(changes[STORAGE_KEY].newValue as Partial<Settings>));
      };
      chrome.storage.onChanged.addListener(handler);
      return () => {
        try {
          chrome.storage.onChanged.removeListener(handler);
        } catch (err) {
          if (!isExtensionContextInvalidated(err)) throw err;
        }
      };
    } catch (err) {
      if (!isExtensionContextInvalidated(err)) throw err;
      // Fall through to storage event listener
    }
  }
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      listener(mergeWithDefaults(JSON.parse(e.newValue) as Partial<Settings>));
    } catch {
      /* skip */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * Peak-End 카운터 증가 — confirm 시 호출. 동시 paste를 고려해 read-modify-write를
 * 한 번에 처리. 0건 마스킹(=override) 케이스는 spans=0으로 호출하여 confirm은 세지만
 * spans 누적은 그대로.
 *
 * loadSettings/saveSettings가 자체적으로 invalidated 오류를 swallow하므로 별도
 * try/catch 불필요.
 */
export async function incrementStats(spansMasked: number): Promise<void> {
  const current = await loadSettings();
  await saveSettings({
    ...current,
    stats: {
      totalConfirmed: current.stats.totalConfirmed + 1,
      totalSpansMasked: current.stats.totalSpansMasked + Math.max(0, spansMasked),
      lastConfirmedAt: new Date().toISOString(),
    },
  });
}

/** 현재 도메인이 whitelist 되었는지 */
export function isDomainWhitelisted(settings: Settings, hostname: string): boolean {
  return settings.whitelistedDomains.some((d) => hostname === d || hostname.endsWith('.' + d));
}
