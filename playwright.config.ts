import { defineConfig, devices } from '@playwright/test';

// Playwright 야간 smoke — 사이트 어댑터(ChatGPT/Claude/Gemini/Perplexity/orange-impact)
// paste 후킹이 실제 브라우저에서 동작하는지 검증. CI 야간 cron에서 실행.
//
// 현재는 test-page (vite dev) smoke만. 실 LLM 사이트는 인증 + bot 감지 회피 필요해
// v1.1+에서 추가 (S20 직전 manual QA로 보완).
//
// 실행:
//   npx playwright install chromium  # 한 번만
//   npm run e2e                       # vite dev 자동 시작 + chromium에서 테스트
//   npm run e2e:headed                # 브라우저 visible
//   npm run e2e:ui                    # interactive UI
export default defineConfig({
  testDir: './playwright',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    // 평행 worktree에서 5173이 점유된 경우 PLAYWRIGHT_BASE_URL로 override.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // webServer는 의도적으로 비워둠 — 외부에서 `npm run dev`를 미리 띄우거나
  // CI에서 별도 service로 5173을 제공한다고 가정. e2e 실행 시 항상 manual.
  // (config의 reuseExistingServer가 vite의 port 충돌을 graceful 처리 못함.)
});
