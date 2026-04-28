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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
