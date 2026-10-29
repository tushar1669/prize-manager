import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'visual.spec.ts', timeout: 60000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8081' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8081 --strictPort',
    url: 'http://127.0.0.1:8081/qa/server-report/',
    timeout: 120000, reuseExistingServer: false,
  },
});
