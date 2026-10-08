/**
 * E2E (CI-03): Chromium desktop and a mobile WebKit viewport. Against a deployed preview when `E2E_BASE_URL` is set
 * (preview.yml); otherwise against a local production build served by `vite preview`.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Visual baselines (e2e/visual.spec.ts), one set per project, made on CI's runner by the `visual` workflow.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: baseURL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 800 } },
    },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: baseURL
    ? undefined
    : {
        command:
          'pnpm --filter @fastlane/web build && pnpm --filter @fastlane/web preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
