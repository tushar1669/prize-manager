import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:'visual.spec.ts',timeout:90000,reporter:'list',
 use:{baseURL:'http://127.0.0.1:8082'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'npm run dev -- --host 127.0.0.1 --port 8082 --strictPort',url:'http://127.0.0.1:8082/qa/team-prizes/',reuseExistingServer:false,timeout:120000}
});
