import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'visual.spec.ts', timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:8080' }, reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 8080 --strictPort',
    url: 'http://127.0.0.1:8080/qa/team-prizes/', timeout: 120000, reuseExistingServer: false },
});
