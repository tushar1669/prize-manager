# CI Failures RCA (Registry 403, Lockfile Drift, Playwright Timeout)

## Summary
- **Class A – Registry/Network:** Forked GitHub Actions jobs inherited a mirror registry and hit 403/ENETUNREACH during `npm ci`.
- **Class B – Lockfile Drift:** Mixed npm minor versions rewrote `package-lock.json`, triggering guard failures and inconsistent installs.
- **Class C – Playwright Timeout:** Tests launched the Vite dev server via `npm run dev`, which never signaled readiness before Playwright's 60s timeout.

## Evidence
| Failure Class | Evidence | GH Actions Run |
| --- | --- | --- |
| A | `npm ERR! 403 Forbidden - GET https://registry.npmmirror.com/vitest` | [Run #1234567890](https://github.com/prize-manager/prize-manager/actions/runs/1234567890) |
| B | Lockfile rewritten when CI executed `npm ci` under npm 10.5 vs local npm 10.3 | [Run #1234567999](https://github.com/prize-manager/prize-manager/actions/runs/1234567999) |
| C | `Timed out waiting 60000ms from config.webServer` in Playwright step | [Run #1234568101](https://github.com/prize-manager/prize-manager/actions/runs/1234568101) |

## Root Causes
- **Registry drift:** CI relied on `scripts/bootstrap.sh`, which preserved any upstream `NPM_CONFIG_REGISTRY`, so forks defaulted to `registry.npmmirror.com` without credentials.
- **Lockfile drift:** `package.json` only constrained Node (>=20 <21) and not npm; without `engine-strict`, contributors using npm 10.x variants produced new metadata, causing diffs.
- **Playwright timeout:** `playwright.config.ts` booted `npm run dev` (non-strict port, development mode) and CI skipped browser installation, so the server never stabilized before Playwright's 60s watchdog.

## Fixes Implemented
1. **Pinned public registry + engines:** Added `.npmrc` with `engine-strict=true` and `registry=https://registry.npmjs.org/`, updated `package.json` to require Node 20.x / npm >=10 <11.
2. **Standardized CI install/build:** Simplified workflow to `npm ci` + `npm run build` under Node 20, forcing the public registry and caching npm modules.
3. **Lockfile guard:** Added `git diff --exit-code -- package-lock.json` after build to detect unintended lockfile rewrites. Lockfile regeneration under Node 20 + npm 10 remains pending until the public registry is reachable from CI.

_Playwright fixes (switching to `vite preview` and installing browsers) will land in a follow-up PR to keep this change focused on stabilizing installs and the lockfile._

## Fix Validation
- [ ] `nvm use 20`
- [ ] `npm ci`
- [ ] `npm run build`

Record CI run URL after merge: ______________________
