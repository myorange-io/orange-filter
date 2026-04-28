import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSettings,
  incrementStats,
  loadSettings,
  saveSettings,
  type Settings,
} from './settings';

// localStorage 폴백 경로 검증 (chrome.storage가 없는 vitest 환경).
describe('settings — Peak-End stats', () => {
  beforeEach(() => {
    // 매 테스트마다 깨끗한 localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('chrome', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaultSettings는 stats 0으로 초기화', () => {
    const s = defaultSettings();
    expect(s.stats.totalConfirmed).toBe(0);
    expect(s.stats.totalSpansMasked).toBe(0);
    expect(s.stats.lastConfirmedAt).toBeNull();
  });

  it('incrementStats는 confirm 1 + spans 누적 + 시각 기록', async () => {
    await incrementStats(7);
    const s1 = await loadSettings();
    expect(s1.stats.totalConfirmed).toBe(1);
    expect(s1.stats.totalSpansMasked).toBe(7);
    expect(s1.stats.lastConfirmedAt).not.toBeNull();

    await incrementStats(3);
    const s2 = await loadSettings();
    expect(s2.stats.totalConfirmed).toBe(2);
    expect(s2.stats.totalSpansMasked).toBe(10);
  });

  it('override (spans=0)는 confirm은 세지만 누적은 그대로', async () => {
    await incrementStats(5);
    await incrementStats(0); // hold-override 시나리오
    const s = await loadSettings();
    expect(s.stats.totalConfirmed).toBe(2);
    expect(s.stats.totalSpansMasked).toBe(5);
  });

  it('음수 spans는 0으로 clamp (오염된 메시지 방어)', async () => {
    await incrementStats(-100);
    const s = await loadSettings();
    expect(s.stats.totalSpansMasked).toBe(0);
  });

  it('구버전 settings (stats 미존재)도 안전하게 로드', async () => {
    // stats 필드가 없는 v0.0.1-pre 사용자 시뮬레이션
    const legacyJson = JSON.stringify({
      enabledByCategory: {},
      modeByCategory: {},
      whitelistedDomains: [],
      userMode: 'default',
    });
    window.localStorage.setItem('oi-filter-settings-v1', legacyJson);
    const s = await loadSettings();
    expect(s.stats.totalConfirmed).toBe(0);
    expect(s.stats.totalSpansMasked).toBe(0);
    expect(s.stats.lastConfirmedAt).toBeNull();
  });

  it('stats 외 필드는 saveSettings 후 보존', async () => {
    const next: Settings = {
      ...defaultSettings(),
      whitelistedDomains: ['example.com'],
    };
    await saveSettings(next);
    await incrementStats(2);
    const s = await loadSettings();
    expect(s.whitelistedDomains).toEqual(['example.com']);
    expect(s.stats.totalSpansMasked).toBe(2);
  });
});
