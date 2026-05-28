import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _CACHE_KEY_FOR_TEST,
  _REMOTE_URL_FOR_TEST,
  getRemoteStoplistInfo,
  initRemoteStoplists,
} from './remote-stoplist';
import {
  _resetRemoteStoplistsForTest,
  detectKoreanPII,
} from './pii/regex';

// chrome.storage.local 인메모리 stub.
function makeStorageStub() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => {
      if (store.has(key)) return { [key]: store.get(key) };
      return {};
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

function installChromeStub(local: ReturnType<typeof makeStorageStub>) {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local },
  };
}

function clearChromeStub() {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
}

const VALID_PAYLOAD = {
  version: '2026-05-26.1',
  updated: '2026-05-26T00:00:00Z',
  stoplists: {
    name_bare: ['딸기'],
    name_2char: [],
    name_4char: [],
    dept_title: [],
    roman_name: [],
  },
};

describe('initRemoteStoplists', () => {
  let storage: ReturnType<typeof makeStorageStub>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = makeStorageStub();
    installChromeStub(storage);
    _resetRemoteStoplistsForTest();
    fetchSpy = vi.fn();
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
  });

  afterEach(() => {
    _resetRemoteStoplistsForTest();
    clearChromeStub();
    vi.restoreAllMocks();
  });

  it('fetch 성공 → stoplist 적용 + 캐시 갱신', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => VALID_PAYLOAD,
    });

    await initRemoteStoplists();

    // '딸기'는 NAME_BARE에 잡힐 패턴(단/2자) — '딸'은 surname이 아니지만 정확한 검증을 위해
    // '오연수' 같은 surname 시작 3자 단어를 stoplist 효과 검증에 사용.
    expect(fetchSpy).toHaveBeenCalledWith(
      _REMOTE_URL_FOR_TEST,
      expect.objectContaining({ cache: 'no-cache' }),
    );
    expect(storage._store.get(_CACHE_KEY_FOR_TEST)).toBeDefined();
  });

  it('원격 stoplist의 name_bare 단어가 person_name으로 안 잡힌다', async () => {
    // 시나리오: 새 오탐 '오피스'를 원격 stoplist로 추가했다고 가정.
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '2026-05-26.2',
        updated: '2026-05-26T01:00:00Z',
        stoplists: { name_bare: ['오피스'] },
      }),
    });

    // 적용 전: '오피스'가 person_name으로 잡힐 수 있음 (오 + 피스, 3자 NAME_BARE)
    const before = detectKoreanPII('오피스 임대 계약').filter(
      (s) => s.category === 'person_name',
    );
    expect(before.map((s) => s.text)).toContain('오피스');

    await initRemoteStoplists();

    // 적용 후: '오피스'가 차단됨
    const after = detectKoreanPII('오피스 임대 계약').filter(
      (s) => s.category === 'person_name',
    );
    expect(after.map((s) => s.text)).not.toContain('오피스');
  });

  it('v1.6: 일반 본문 NAME_BARE는 항상 tentative (homonym 카테고리는 backward-compat만)', async () => {
    // v1.5.8에서는 name_homonym set 가입 단어만 tentative였으나, v1.6에서 일반 본문의 모든
    // NAME_BARE가 tentative로 일반화됨. schema의 name_homonym 카테고리는 backward-compat을
    // 위해 유지(payload 거부하지 않음). 동작상 NAME_BARE 매치는 set 가입과 무관하게 tentative.
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '2026-05-28.x',
        updated: '2026-05-28T00:00:00Z',
        stoplists: { name_homonym: ['오현우'] },
      }),
    });
    // 적용 전: 이미 tentative=true (v1.6 일반화).
    const before = detectKoreanPII('오현우가 도착했다').filter(
      (s) => s.category === 'person_name' && s.text === '오현우',
    );
    expect(before[0]?.tentative).toBe(true);

    await initRemoteStoplists();

    // 적용 후도 tentative=true. set 가입은 의미 없음.
    const after = detectKoreanPII('오현우가 도착했다').filter(
      (s) => s.category === 'person_name' && s.text === '오현우',
    );
    expect(after[0]?.tentative).toBe(true);
  });

  it('fetch 실패 + 캐시 없음 → no-op (번들 default만)', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    await initRemoteStoplists();

    // BUNDLED stoplist에 있던 '오렌지'는 여전히 차단되어야 함 (v1.5.6 default).
    const spans = detectKoreanPII('오렌지 필터').filter(
      (s) => s.category === 'person_name',
    );
    expect(spans).toEqual([]);
  });

  it('fetch 실패 + stale 캐시 있음 → 캐시 사용 (회귀 방지)', async () => {
    // 사전 조건: 25h 전 캐시.
    const cachedEntry = {
      fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      data: {
        version: '2026-05-25.1',
        updated: '2026-05-25T00:00:00Z',
        stoplists: { name_bare: ['오피스'] },
      },
    };
    storage._store.set(_CACHE_KEY_FOR_TEST, cachedEntry);

    fetchSpy.mockRejectedValue(new Error('offline'));

    await initRemoteStoplists();

    // stale 캐시라도 적용되어 '오피스'가 차단되어야 함.
    const spans = detectKoreanPII('오피스 임대').filter(
      (s) => s.category === 'person_name',
    );
    expect(spans.map((s) => s.text)).not.toContain('오피스');
  });

  it('신선한 캐시(< 12h) → 네트워크 호출 없음', async () => {
    const cachedEntry = {
      fetchedAt: Date.now() - 1 * 60 * 60 * 1000, // 1h ago
      data: {
        version: '2026-05-26.1',
        updated: '2026-05-26T00:00:00Z',
        stoplists: { name_bare: ['오피스'] },
      },
    };
    storage._store.set(_CACHE_KEY_FOR_TEST, cachedEntry);

    await initRemoteStoplists();

    expect(fetchSpy).not.toHaveBeenCalled();
    const spans = detectKoreanPII('오피스 임대').filter(
      (s) => s.category === 'person_name',
    );
    expect(spans.map((s) => s.text)).not.toContain('오피스');
  });

  it('잘못된 스키마 → 폐기, 회귀 없음', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 123, // 잘못된 타입
        stoplists: 'invalid',
      }),
    });

    await initRemoteStoplists();

    // BUNDLED는 그대로. 캐시도 저장 안 됨.
    expect(storage._store.has(_CACHE_KEY_FOR_TEST)).toBe(false);
    // '오렌지'는 BUNDLED에 있으므로 여전히 차단.
    expect(
      detectKoreanPII('오렌지 필터').filter((s) => s.category === 'person_name'),
    ).toEqual([]);
  });

  it('HTTP 4xx/5xx → 폐기', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    await initRemoteStoplists();

    expect(storage._store.has(_CACHE_KEY_FOR_TEST)).toBe(false);
  });

  it('진짜 인명 recall 영향 없음', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '2026-05-26.1',
        updated: '2026-05-26T00:00:00Z',
        stoplists: { name_bare: ['오피스', '오렌지'] },
      }),
    });

    await initRemoteStoplists();

    // 진짜 인명은 여전히 잡혀야 함.
    const names = detectKoreanPII('김민수 팀장님께')
      .filter((s) => s.category === 'person_name')
      .map((s) => s.text);
    expect(names).toContain('김민수');
  });
});

describe('getRemoteStoplistInfo', () => {
  let storage: ReturnType<typeof makeStorageStub>;

  beforeEach(() => {
    storage = makeStorageStub();
    installChromeStub(storage);
  });

  afterEach(() => {
    clearChromeStub();
  });

  it('캐시 있음 → version/updated/fetchedAt 반환', async () => {
    storage._store.set(_CACHE_KEY_FOR_TEST, {
      fetchedAt: 1_700_000_000_000,
      data: VALID_PAYLOAD,
    });
    const info = await getRemoteStoplistInfo();
    expect(info).toEqual({
      version: '2026-05-26.1',
      updated: '2026-05-26T00:00:00Z',
      fetchedAt: 1_700_000_000_000,
    });
  });

  it('캐시 없음 → null', async () => {
    const info = await getRemoteStoplistInfo();
    expect(info).toBeNull();
  });
});
