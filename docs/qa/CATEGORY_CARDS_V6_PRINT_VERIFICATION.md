# Category Cards Updated (v6) — print verification

**Scope:** PR #461, `feat/category-cards-updated-v6`. Owner chose Option A (opt-in v6, legacy v1 default). This is presentation-only; no engine, data, export workbook, or entitlement change.

## Source checks
- Base `main`: `943326ed529a205ffb5260035d1c0cb3ef00d35c`.
- The legacy `CategoryCardsView.tsx` is unchanged; v6 delegates to it with the same props, access state and preview limits.
- `Finalize.tsx` still initializes `FinalViewTab` to `'v1'`. The route `/t/:id/final/v1` remains intact, and `/t/:id/final/v6` is an optional tab.
- Styling is scoped to `.pm-category-cards-updated`; shared `.pm-print-surface` remains unchanged.
- The corrected stylesheet blob SHA is `25ef1e0ad13a5bcea1c8bacd6ab470dbac73159a`.

## Browser-print fixture evidence (partial, not full-app QA)
A local headless Chromium A4 browser-print probe used **synthetic winners**, representative markup based on `CategoryCardsView`, existing category print rules, and the exact v6 stylesheet (blob hash matched). It did **not** run the full React app, authentication, data loader, or production site.

| Fixture | A4 pages | Expected winner rows | Text extraction | Outside-page words |
| --- | ---: | ---: | --- | ---: |
| Two short categories | 1 | 6 (4+2) | All present | 0 |
| One six-column category (no gifts) | 1 | 4 | All present | 0 |
| 90-row category | 4 | 90 | All present, once each | 0 |
| 26 long-name / long-gift rows | 3 | 26 | All present, once each | 0 |

Table header appeared on each printed page containing a continued table. A visual inspection identified a draft defect: narrow Rank, Amount, Trophy and Medal columns wrapped in the seven-column layout. The v6-only CSS was corrected to reserve explicit widths for six- versus seven-column tables and avoid wrapping rank/amount values. The printed fixture was then rerun with no missing rows or outside-page words. PDFs are transient QA artifacts, not product exports or production evidence.

**Important limits:** Neither visual inspection nor extracted-text counts prove zero overlap in all real tournament data. The full-app A4 print run, actual public/private entitlement behavior, in-app data parity, build, lint, and automated tests remain **NOT VERIFIED**.

## GitHub CI dependency blocker
- GitHub Actions CI run `39439579656` failed at `npm ci`, before build/lint/unit/Playwright execution.
- Its logs show `EUSAGE`: `package.json` and `package-lock.json` are out of sync. Missing lockfile entries include `react-helmet-async@3.0.0`, `invariant@2.2.4`, `react-fast-compare@3.2.2`, and `shallowequal@1.1.0`.
- The PR does not modify either package manifest or lockfile. Subsequent CI attempt after the CSS correction also failed at dependency installation. Do not declare CI or release verification passed.
- Reconcile this existing lockfile issue independently under review; do not weaken CI or change dependencies speculatively to make tests green.

## Release gate
Keep PR #461 **draft and unmerged** until clean-install CI succeeds and a full-app, fixture-backed print test confirms readable A4 pages, winner/amount parity, long text and gifts, and entitlement equivalence. Do not access known auto-finalizing production tournament fixtures.
