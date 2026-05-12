// 확장 로드 e2e — production 경로 (background SW + offscreen) 통합 회귀.
//
// 검증 범위:
//   1) background SW 활성화 — chrome.runtime.sendMessage 라우팅 동작
//   2) DETECT_REQUEST → regex + NER 합산 결과 반환 (모델 미로드면 regex fallback)
//   3) MODEL_STATUS 응답 — offscreen document lazy-init 동작
//
// 검증 X (다른 spec/툴이 담당):
//   - paste 모달 UI 내부 (closed Shadow DOM 한계 — 단위 테스트로)
//   - NER 정확도 자체 (eval-aegis 워크플로우)
//   - 사이드패널 카테고리 UI (paste-modal.spec.ts > Sidepanel smoke)
//
// 사전 조건: dist/ 빌드 완료. CI는 npm run build로 사전 빌드.
// chromium은 extension 로드 시 headed 또는 --headless=new 필요. CI에선 xvfb-run.

import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const EXT_PATH = join(dirname(__filename), '..', 'dist');

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  sidepanelPage: Page;
}

// Extension은 chromium의 headless 모드에서 동작 제한적 — headless: false 사용.
// CI: ubuntu-latest에서 xvfb-run로 감싸 가상 디스플레이 제공.
const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // SW lazy — 첫 메시지/이벤트 전까지 안 깨어남. install 시 ensureOffscreen이 호출되므로
    // load 직후 serviceWorker가 등장하지만 timing 변수 있어 waitForEvent fallback.
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
    const id = new URL(sw.url()).host;
    await use(id);
  },
  sidepanelPage: async ({ context, extensionId }, use) => {
    // production 흐름: 사이드패널 context에서 chrome.runtime.sendMessage 호출.
    // SW self-sendMessage는 자기 onMessage 미도달이라 sidepanel page를 caller로 사용.
    // GateScreen 우회 불필요 — 메시지 라우팅만 검증하므로 어떤 페이지 상태든 chrome.runtime 사용 가능.
    const page = await context.newPage();
    page.on('console', (msg) => console.log(`[sidepanel ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`[sidepanel pageerror] ${err.message}`));
    await page.goto(
      `chrome-extension://${extensionId}/src/sidepanel/sidepanel.html`,
      { waitUntil: 'domcontentloaded', timeout: 15_000 },
    );
    await use(page);
    await page.close();
  },
});

test.describe('Extension loaded — background SW + offscreen 통합', () => {
  test('background SW 활성화 + PING 라우팅 동작', async ({ sidepanelPage }) => {
    const response = await sidepanelPage.evaluate(async () => {
      return chrome.runtime.sendMessage({
        kind: 'PING',
        requestId: 'test-ping-1',
        payload: null,
      });
    });
    expect(response).toMatchObject({
      kind: 'PING',
      inResponseTo: 'test-ping-1',
    });
  });

  test('DETECT_REQUEST → regex + NER 합산 결과 (모델 미로드면 regex만)', async ({
    sidepanelPage,
  }) => {
    const sampleText =
      '안녕하세요. 김민수 부장입니다. 연락처는 010-1234-5678입니다.';

    const response = await sidepanelPage.evaluate(async (text) => {
      return chrome.runtime.sendMessage({
        kind: 'DETECT_REQUEST',
        requestId: 'test-detect-1',
        payload: { text },
      });
    }, sampleText);

    expect(response).toMatchObject({
      kind: 'DETECT_RESULT',
      inResponseTo: 'test-detect-1',
      payload: { textLength: sampleText.length },
    });

    // regex는 모델 무관하게 mobile 매치 — 라우팅이 살아 있으면 반드시 1건 이상.
    const spans = (response as { payload: { spans: Array<{ category: string }> } })
      .payload.spans;
    const mobileSpans = spans.filter((s) => s.category === 'mobile');
    expect(mobileSpans.length).toBeGreaterThanOrEqual(1);
  });

  // MODEL_STATUS / MODEL_DOWNLOAD_REQUEST 같은 offscreen 의존 메시지는 production chromium에선
  // 동작하지만 Playwright launchPersistentContext에선 chrome.offscreen API 응답이 null로 돌아옴
  // (환경 한계). 사용자가 실제 chrome에서 익스텐션 로드하면 정상. 이 spec은 SW + 메시지 라우팅
  // 회귀만 담당하고, offscreen + 모델 정확도는 eval-aegis.yml이 별도로 커버.
});
