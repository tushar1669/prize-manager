import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'e2e', testMatch:['**/poster-grid-visual.spec.ts'],
  retries:0, workers:1, reporter:'line', timeout:90000,
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url:'http://127.0.0.1:5173/qa-fixtures/poster-grid-visual.html',
    reuseExistingServer:false, timeout:120000,
  }
});
