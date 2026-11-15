import { defineConfig, devices } from '@playwright/test';

/** PW_CHANNEL=chrome runs the tests on an installed Google Chrome instead of Playwright's own Chromium. */
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, channel } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: { command: 'npm run dev -- -p 3000', url: 'http://localhost:3000/fields', reuseExistingServer: true, timeout: 120_000 },
});
