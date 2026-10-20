# Category Cards Updated (v6) — QA and release gate

**Current state:** PR #461 draft, **NOT VERIFIED / NOT RELEASED**. Owner approved Option A: legacy v1 remains the default and separately accessible; updated v6 is opt-in. B8b remains IN_PROGRESS with D2 open.

## Visual-design correction

The first v6 attempt wrapped the original v1 view in CSS. It improved text fit but did not make category groups distinguishable. The owner's review of the delivered A4 PDF rejected the visual quality: near-monochrome tables, tiny main-category marker, weak section boundaries.

The revised v6 now renders its own *presentation* while reusing existing `FinalPrizeCategoryGroup` records, `formatCurrencyINR`, `formatGiftItems`, `stripAwardMarkers`, and `getAwardFlagsForPrizeRow`. No engine or data changes. Its visual structure has numbered category panels, category accents drawn from existing `--accent` (gold), `--primary` (teal green), and `--secondary` (navy) design tokens, large category headings, prominent main-category wording, zebra winner rows, printed category context on continued pages, and restrained site attribution. This styling applies only within `.pm-category-cards-updated` and preserves `.pm-print-surface`.

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

## Design system, logo, and typography reconciliation (21 October 2026)

Evidence: `docs/BRANDING_ASSETS.md`, `docs/design/UI_CONVENTIONS.md`, `src/index.css`, `tailwind.config.ts`, `index.html`, original PNG headers and current v6 CSS.

- **Green:** v6 non-main green is `hsl(var(--primary))` = approximately `#206A54`, the existing application's primary teal/green; **not** the different `--success` green (`#16A249`). This is category differentiation, not a success claim.
- **Gold/yellow:** v6 main category uses `hsl(var(--accent))` = approximately `#CFAB59`, not `--warning` orange (`#F59F0A`). The brand guide gives `#CDAA59` as a nominal gold; this small numerical difference is in the existing global token, **not** introduced by v6. Preserve the application token rather than modifying global colors in this UI-only PR.
- **Navy:** v6 uses `hsl(var(--secondary))` for alternate category accents. The logo print footer has a brand-guide navy `#0B3D91` background for contrast. The global secondary token is approximately `#0D3B91`; this pre-existing minor difference is not globally changed by v6.
- **Official logo assets are different:** `public/brand/prize-manager-logo-transparent-cropped.png` is a **1221 × 346 RGBA PNG** (alpha channel, native transparent background), used in `index.html` and referenced unchanged by the v6 print footer. `public/brand/prize-manager-logo.png` is a **1536 × 1024 RGB PNG** (no alpha; has its own dark backdrop). The footer paints a separate navy support background because the transparent logo has white text. **No edits/recolors are made to the logo file itself.**
- **Logo scaling correction:** The prior 45mm background-image width would render the 1221:346 image about **12.75mm tall** inside a **10mm** footer area, risking clipping. Reduced to **34mm wide**, rendering about **9.64mm tall** without changing image proportions. This is a calculated source-level correction; full-app print rendering remains **NOT VERIFIED**.
- **Typography:** The application uses Tailwind's default UI sans-serif stack, and v6 inherits that stack; the margin footer explicitly uses `ui-sans-serif, system-ui, sans-serif`. Distinct heading/row/metadata sizes remain in v6 print rules. The manually edited PDF examples use an Arimo/Helvetica mix and a rasterized emblem approximation, so **they do not prove exact application font or pixel-perfect official logo fidelity**. Do not treat those examples as source-of-truth renders.

The print-level color treatment is not an assertion that any category is in a success, warning, or error state. The existing `.pm-print-surface` implementation is untouched. No further brand palette or typography restructuring is authorized here.
