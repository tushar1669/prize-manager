import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: [
    '**/allocation/**',
    '**/institution/**',
    '**/utils/**',
    '**/allocator-tie-break.spec.ts',
    '**/import-name-column-priority.spec.ts',
    '**/conflict-utils.spec.ts',
    '**/category-prizes-delta.spec.ts',
    '**/gender-logic.spec.ts',
    '**/player-name.spec.ts',
    '**/utils/valueNormalizers.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@swiss/,
    },
    {
      name: 'chromium@swiss',
      use: { ...devices['Desktop Chrome'] },
      grep: /@swiss/,
      timeout: 120_000,
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
