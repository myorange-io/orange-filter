// CWS 출시용 스크린샷 자동 생성 spec.
// 실행: npx playwright test playwright/screenshots.spec.ts
//
// 출력: releases/screenshots/01-05.png + promo small/marquee.
// 각 1280×800 PNG (CWS 권장). Chrome 확장 사이드패널과 동등한 vite dev 환경에서 캡처.

import { test, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const OUT_DIR = join(dirname(__filename), '..', 'releases', 'screenshots');

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    // 빈 enabledByCategory를 보내면 카운터가 0/17로 표시됨 — partial settings로
    // 기본값 mergeWithDefaults가 default ON을 채우게 함 (12/17 ON 자연스러움).
    localStorage.setItem('oi-filter-settings-v1', JSON.stringify({ theme: t }));
  }, theme);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test.describe('CWS screenshots', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('01 — 사이드패널 라이트 모드', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(OUT_DIR, '01-sidepanel-light.png'),
      fullPage: false,
    });
  });

  test('02 — 사이드패널 다크 모드', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'dark');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(OUT_DIR, '02-sidepanel-dark.png'),
      fullPage: false,
    });
  });

  test('03 — paste 모달 (개인정보 7건 발견)', async ({ page }) => {
    await page.goto('/src/test-page/test.html');
    await page.click('#trigger-direct');
    // closed shadow root 내부 모달 렌더 대기 — host 가시화는 light DOM에서 보임
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(OUT_DIR, '03-paste-modal.png'),
      fullPage: false,
    });
  });

  test('04 — 카테고리 토글 + 마스킹 모드 드롭다운', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    // 휴대폰 번호 카테고리 dropdown 열기 — 첫 화면에서 사람 이름이 위에 있음
    const trigger = page.getByLabel('휴대폰 번호 마스킹 모드').first();
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(OUT_DIR, '04-category-dropdown.png'),
      fullPage: false,
    });
  });

  test('05 — 사이드패널 풀 스크롤 (전체 영역)', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    // 카테고리 부분까지 살짝 스크롤 — 모델 카드 + 드롭존 + 카테고리 일부 보이게
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(OUT_DIR, '05-categories-scrolled.png'),
      fullPage: false,
    });
  });
});

test.describe('CWS promo images', () => {
  test('promo small 440×280', async ({ page }) => {
    await page.setViewportSize({ width: 440, height: 280 });
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(OUT_DIR, 'promo-small-440x280.png'),
      fullPage: false,
    });
  });

  test('promo marquee 1400×560', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 560 });
    await page.goto('/src/sidepanel/sidepanel.html');
    await setTheme(page, 'light');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(OUT_DIR, 'promo-marquee-1400x560.png'),
      fullPage: false,
    });
  });
});
