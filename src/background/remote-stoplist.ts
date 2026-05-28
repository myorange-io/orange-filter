// 원격 stoplist fetcher (v1.5.6+) — GitHub raw URL에서 JSON을 받아 regex stoplist를 갱신.
//
// 목적: 새 오탐 패턴 발견 시 CWS 검수(1~3일)를 거치지 않고 핫픽스. 운영자가 main에
// commit + push만 하면 사용자 확장이 다음 시작 또는 12h cache 만료 시 자동 반영.
//
// 흐름:
//   1. chrome.storage.local 캐시 확인
//   2. 캐시 신선(< 12h) → 적용 후 종료 (네트워크 호출 없음)
//   3. 캐시 만료 또는 없음 → fetch (10s timeout)
//   4. fetch 성공 → 적용 + 캐시 갱신
//   5. fetch 실패 → 만료 캐시라도 적용 (오프라인·서버 장애에서 회귀 방지)
//   6. 캐시도 없으면 → no-op. regex.ts의 BUNDLED stoplist만 동작.
//
// TTL 변경 이력:
//   v1.5.6: 24h (보수적 시작)
//   v1.5.8.1: 12h — 핫픽스 반영 속도 ↑. 사용자 startup 시 fetch는 그대로, 장기
//     세션 사용자(SW 살아있는 동안 startup 이벤트 없음)의 핫픽스 반영 시간 단축.
//
// 보안:
//   - HTTPS + manifest host_permissions로 도메인 제한 (raw.githubusercontent.com).
//   - 스키마 validation. 잘못된 페이로드는 폐기.
//   - SHA256 무결성 검증은 v2에서.

import { applyRemoteStoplists, type RemoteStoplistPayload } from './pii/regex';

const REMOTE_URL =
  'https://raw.githubusercontent.com/myorange-io/orange-filter/main/stoplists/remote-stoplist.json';
const CACHE_KEY = 'remote_stoplist_cache_v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface RemoteStoplistFile {
  readonly version: string;
  readonly updated: string;
  readonly stoplists: RemoteStoplistPayload;
}

interface CachedEntry {
  readonly fetchedAt: number;
  readonly data: RemoteStoplistFile;
}

const KNOWN_STOPLIST_KEYS = [
  'name_bare',
  'name_2char',
  'name_4char',
  'dept_title',
  'roman_name',
] as const;

function isStoplistPayload(value: unknown): value is RemoteStoplistPayload {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  for (const key of KNOWN_STOPLIST_KEYS) {
    const v = s[key];
    if (v === undefined) continue;
    if (!Array.isArray(v)) return false;
    if (!v.every((x) => typeof x === 'string')) return false;
  }
  return true;
}

function isRemoteStoplistFile(value: unknown): value is RemoteStoplistFile {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.version !== 'string') return false;
  if (typeof o.updated !== 'string') return false;
  return isStoplistPayload(o.stoplists);
}

async function readCache(): Promise<CachedEntry | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const r = await chrome.storage.local.get(CACHE_KEY);
    const entry = r[CACHE_KEY] as unknown;
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { fetchedAt?: unknown }).fetchedAt === 'number' &&
      isRemoteStoplistFile((entry as { data?: unknown }).data)
    ) {
      return entry as CachedEntry;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(data: RemoteStoplistFile): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const entry: CachedEntry = { fetchedAt: Date.now(), data };
    await chrome.storage.local.set({ [CACHE_KEY]: entry });
  } catch {
    // 캐시 실패는 무시 — 다음 시작 시 재시도.
  }
}

function isExpired(entry: CachedEntry): boolean {
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

async function fetchRemote(signal: AbortSignal): Promise<RemoteStoplistFile | null> {
  try {
    const res = await fetch(REMOTE_URL, { signal, cache: 'no-cache' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isRemoteStoplistFile(json)) {
      console.warn('[remote-stoplist] 잘못된 스키마, 폐기');
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

/**
 * background SW startup에서 1회 호출. 멱등성: 여러 번 호출해도 동작 동일.
 * 실패해도 throw하지 않음 — 호출자가 await 없이 fire-and-forget 가능.
 */
export async function initRemoteStoplists(): Promise<void> {
  const cached = await readCache();
  if (cached && !isExpired(cached)) {
    applyRemoteStoplists(cached.data.stoplists);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let fresh: RemoteStoplistFile | null = null;
  try {
    fresh = await fetchRemote(controller.signal);
  } finally {
    clearTimeout(timer);
  }

  if (fresh) {
    applyRemoteStoplists(fresh.stoplists);
    await writeCache(fresh);
    return;
  }

  if (cached) {
    // 네트워크 실패 — stale 캐시라도 적용해 회귀 방지.
    applyRemoteStoplists(cached.data.stoplists);
  }
}

/** UI 표시용 — 현재 캐시된 stoplist의 메타. */
export async function getRemoteStoplistInfo(): Promise<{
  version: string;
  updated: string;
  fetchedAt: number;
} | null> {
  const c = await readCache();
  if (!c) return null;
  return {
    version: c.data.version,
    updated: c.data.updated,
    fetchedAt: c.fetchedAt,
  };
}

/** 테스트 전용 — 캐시 키. */
export const _CACHE_KEY_FOR_TEST = CACHE_KEY;
/** 테스트 전용 — 원격 URL. */
export const _REMOTE_URL_FOR_TEST = REMOTE_URL;
