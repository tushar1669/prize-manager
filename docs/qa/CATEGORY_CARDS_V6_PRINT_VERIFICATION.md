# Category Cards Updated (v6) — QA and release gate

**Current state:** PR #461 draft, **NOT VERIFIED / NOT RELEASED**. Owner approved Option A: legacy v1 remains the default and separately accessible; updated v6 is opt-in. B8b remains IN_PROGRESS with D2 open.

## Visual-design correction

The first v6 attempt wrapped the original v1 view in CSS. It improved text fit but did not make category groups distinguishable. The owner's review of the delivered A4 PDF rejected the visual quality: near-monochrome tables, tiny main-category marker, weak section boundaries.

The revised v6 now renders its own *presentation* while reusing existing `FinalPrizeCategoryGroup` records, `formatCurrencyINR`, `formatGiftItems`, `stripAwardMarkers`, and `getAwardFlagsForPrizeRow`. No engine or data changes. Its visual structure has numbered category panels, distinct gold/blue/teal/violet top boundaries, large category headings, prominent main-category wording, zebra winner rows, printed category context on continued pages, and restrained site attribution. This styling applies only within `.pm-category-cards-updated` and preserves `.pm-print-surface`.

## Source parity checks
- Legacy `src/components/final-prize/CategoryCardsView.tsx` and `/t/:id/final/v1` are unchanged.
- `src/pages/Finalize.tsx` still initializes its active view to `'v1'`.
- V6 retains the same filtering of empty groups, selection of visible main-category winners, `previewMainLimit`, and per-category permissions.
- Non-main categories with no full access remain masked, without their placement count or names. The main preview still shows its allowed rows and a count of hidden prizes.
- The same winner place, player name, club/state, rank, amount, gift, trophy and medal information is presented; only visual formatting and blank-award placeholders differ.

## Synthetic A4 browser-print prototype

Local headless Chromium A4 PDFs were generated with representative HTML matching the revised CSS, **not with the fully installed React application or live data**. The tests do not validate auth/session, server entitlements, actual data loading, or complete production behavior.

| Fixture | Pages | Synthetic winners | Observed result |
| --- | ---: | ---: | --- |
| Multiple visually distinct categories | 2 | 9 | Category panels differentiated; all winners present; none outside page margins |
| One long category with long names/gifts | 3 | 24 | Repeated category/table headings on continued pages; no off-page words |
| Six-column categories without gifts | 1 | 6 | Readable columns and visual section boundaries; none outside page margins |

Rendered previews were inspected as images. Actual site output can differ in CSS context, user print settings, browser or data. No conclusive claim of zero clipping, full data parity or accessibility compliance until full-app QA.

## CI blocker (unchanged)
- The PR CI fails in `npm ci`, before build, lint, unit or browser tests run.
- GitHub workflow logs report package/lockfile mismatch: missing `react-helmet-async@3.0.0`, `invariant@2.2.4`, `react-fast-compare@3.2.2`, and `shallowequal@1.1.0` from `package-lock.json`.
- This PR does not change package manifests. Investigate and reconcile the baseline lockfile issue in a separately reviewed change; do not bypass required checks.

## Blocking final verification
1. Get clean-install CI working, then run build, lint, unit tests and relevant Playwright.
2. Render the **actual v6 React component** via a safe fixture-backed authenticated app context for A4 print with/without gift, multi-category and long-category cases.
3. Verify v1-v6 winners/amounts/awards/permissions against the same input, clipping, page breaks, header continuation and print with background graphics disabled.
4. Only then request owner review/approval for merge. Do not merge or deploy from this draft.
