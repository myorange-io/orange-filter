// 사용자 설정 — chrome.storage.local에 저장. 비-확장 환경(test page, vite dev)에서는
// localStorage로 폴백. 모든 변경은 chrome.storage.onChanged 또는 storage 이벤트로 전파.

import { CATEGORIES, CATEGORY_ORDER } from '@/background/pii/categories';
import type { MaskMode, PIICategory } from './types';

export interface Settings {
  /** 카테고리별 마스킹 활성화 */
  enabledByCategory: Partial<Record<PIICategory, boolean>>;
  /** 카테고리별 마스킹 모드 */
  modeByCategory: Partial<Record<PIICategory, MaskMode>>;
  /** 화이트리스트 도메인 — 어댑터가 paste 가로채지 않음 */
  whitelistedDomains: ReadonlyArray<string>;
  /** 사용자 모드 (라우터로 전달) */
  userMode: 'default' | 'multilingual' | 'precision_high';
}

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
  };
}

const hasChromeStorage = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function loadSettings(): Promise<Settings> {
  if (hasChromeStorage()) {
    const obj = await chrome.storage.local.get(STORAGE_KEY);
    const raw = obj[STORAGE_KEY] as Settings | undefined;
    return { ...defaultSettings(), ...raw };
  }
  // localStorage fallback
  try {
    const json = window.localStorage?.getItem(STORAGE_KEY);
    if (!json) return defaultSettings();
    return { ...defaultSettings(), ...(JSON.parse(json) as Settings) };
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return;
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
    const handler = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      listener({ ...defaultSettings(), ...(changes[STORAGE_KEY].newValue as Settings) });
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      listener({ ...defaultSettings(), ...(JSON.parse(e.newValue) as Settings) });
    } catch {
      /* skip */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/** 현재 도메인이 whitelist 되었는지 */
export function isDomainWhitelisted(settings: Settings, hostname: string): boolean {
  return settings.whitelistedDomains.some((d) => hostname === d || hostname.endsWith('.' + d));
}
