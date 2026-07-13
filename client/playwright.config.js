import { defineConfig, devices } from '@playwright/test';

const isHeadedRun = process.env.E2E_HEADED === 'true' || process.argv.includes('--headed');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: isHeadedRun ? 600_000 : 120_000,
  expect: {
    timeout: isHeadedRun ? 60_000 : 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: isHeadedRun ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isHeadedRun ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../server run start:e2e',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:e2e',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
