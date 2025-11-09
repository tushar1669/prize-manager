#!/usr/bin/env node
/* Guarded Playwright install: never fail CI */
import { execSync } from 'node:child_process';

const skip = process.env.PLAYWRIGHT_SKIP === '1';
const isCI = process.env.CI === '1';
const allowCIInstall = process.env.PLAYWRIGHT_INSTALL === '1';

if (skip) {
  console.log('[postinstall] PLAYWRIGHT_SKIP=1 → skipping browser install');
  process.exit(0);
}

if (isCI && !allowCIInstall) {
  console.log('[postinstall] CI detected and PLAYWRIGHT_INSTALL!=1 → skipping browser install');
  process.exit(0);
}

try {
  console.log('[postinstall] Installing Playwright browsers...');
  execSync('npx playwright install --with-deps', { stdio: 'inherit' });
  console.log('[postinstall] Playwright browsers installed');
} catch (err) {
  console.warn('[postinstall] WARNING: playwright install failed but will not block install.');
  console.warn(String(err && err.message ? err.message : err));
}
process.exit(0);
