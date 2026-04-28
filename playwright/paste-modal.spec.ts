import { expect, test } from '@playwright/test';

// Paste 모달 트리거 + 마스킹 미리보기 + a11y 라벨 smoke.
// 실 LLM 사이트(chatgpt.com 등)는 인증 + bot 감지 우회 필요해 본 skeleton에서는
// test-page만 검증. v1.1+에서 page.context()에 인증 cookie 주입하여 확장 cosmoke.

test.describe('PasteModal smoke (test-page)', () => {
  test('직접 트리거 → 모달 + 카테고리 뱃지 + 미리보기 마스킹', async ({ page }) => {
    await page.goto('/src/test-page/test.html');
    await page.click('#trigger-direct');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // honorific 카피 확인
    await expect(dialog).toContainText('개인정보');
    await expect(dialog).toContainText('발견했어요');

    // 미리보기에 마스킹된 텍스트 — 휴대폰은 010-XXXX-XXXX 형태
    const preview = dialog.getByLabel('마스킹 미리보기');
    await expect(preview).toContainText('010-XXXX-XXXX');

    // a11y: confirm 버튼 aria-label
    const confirm = dialog.getByLabel(/가리고 안전하게 붙여넣기/);
    await expect(confirm).toBeVisible();

    // 취소 버튼 aria-label
    const cancel = dialog.getByLabel('취소하고 원래대로 돌아가기');
    await expect(cancel).toBeVisible();
  });
});

test.describe('Sidepanel smoke', () => {
  test('헤더 + 모델 인라인 카드 + 카테고리 17개', async ({ page }) => {
    await page.goto('/src/sidepanel/sidepanel.html');

    // 헤더 부텍스트 두 줄
    await expect(page.locator('header')).toContainText('개인정보를 이 PC 안에서 자동으로 가립니다');
    await expect(page.locator('header')).toContainText('외부 서버에 전송하지 않습니다');

    // 모델 인라인
    await expect(page.getByText('한국어 정밀 보호 모델')).toBeVisible();
    await expect(page.getByRole('button', { name: /설치/ })).toBeVisible();

    // 카테고리 토글 17개 (사람 이름 포함)
    const switches = await page.getByRole('switch').count();
    expect(switches).toBe(17);

    // 첫 카테고리는 사람 이름
    await expect(page.getByLabel(/^사람 이름 마스킹/)).toBeVisible();
  });
});
