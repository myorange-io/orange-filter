import { expect, test } from '@playwright/test';

// Paste 모달 트리거 + 마스킹 미리보기 + a11y 라벨 smoke.
// 실 LLM 사이트(chatgpt.com 등)는 인증 + bot 감지 우회 필요해 본 skeleton에서는
// test-page만 검증. v1.1+에서 page.context()에 인증 cookie 주입하여 확장 cosmoke.
//
// 모달은 closed Shadow DOM 안에 mount되어 host 페이지에서 격리된다(보안 의도).
// Playwright는 closed shadow를 piercing 못 하므로 host element 존재 + page-level
// 효과(콘솔 로그, paste 결과 등)로 검증한다. 깊은 dialog 내부 검증은 vitest 단위
// 테스트 또는 Claude in Chrome MCP의 page-context JS 실행으로 보강.

test.describe('PasteModal smoke (test-page)', () => {
  test('직접 트리거 → shadow host mount + closed mode 격리 확인', async ({ page }) => {
    await page.goto('/src/test-page/test.html');

    // showPasteModal은 v1.2부터 비동기 (background DETECT_REQUEST await).
    // chrome.runtime이 없는 vite dev 환경에서는 정규식 폴백으로 즉시 결과 반환.
    await page.click('#trigger-direct');

    // shadow host element가 main document에 attached되는지 검증.
    const host = page.locator('#oi-filter-shadow-host');
    await expect(host).toBeAttached({ timeout: 5_000 });

    // closed shadow root는 host.shadowRoot로 접근 못 함 — 의도된 보안 격리.
    const shadowRootIsClosed = await host.evaluate((el) => (el as HTMLElement).shadowRoot === null);
    expect(shadowRootIsClosed).toBe(true);

    // host는 viewport를 덮을 수 있도록 max z-index + position:fixed.
    const style = await host.getAttribute('style');
    expect(style).toContain('z-index: 2147483647');
  });
});

test.describe('Sidepanel smoke', () => {
  test('헤더 + 모델 인라인 카드 + 카테고리 17개', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');

    // 헤더 부텍스트 두 줄
    await expect(page.locator('header')).toContainText('개인정보를 이 PC 안에서 자동으로 가립니다');
    await expect(page.locator('header')).toContainText('외부 서버에 전송하지 않습니다');

    // 모델 인라인 라벨 — exact: true로 안내 문구 중복 매치 회피
    await expect(page.getByText('한국어 정밀 보호 모델', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /설치/ })).toBeVisible();

    // 카테고리 토글 17개 (사람 이름 포함)
    const switches = await page.getByRole('switch').count();
    expect(switches).toBe(17);

    // 첫 카테고리는 사람 이름 — switch role로 좁혀서 같은 행의 mode combobox와 충돌 회피
    await expect(page.getByRole('switch', { name: /^사람 이름 마스킹/ })).toBeVisible();
  });
});
