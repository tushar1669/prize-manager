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
- **Logo sizing history:** An earlier background-image approach set the logo to 34mm but later real Chromium PDF tests showed that margin-box backgrounds were omitted. The accepted v6 print rule now uses a 10x resolution-aware `image-set()` of the **unchanged official 1221×346 transparent PNG**, visually scaled to approximately 34mm within the 10mm margin box. This passed real-component Chromium print fixtures; see latest evidence below.
- **Typography:** The application uses Tailwind's default UI sans-serif stack, and v6 inherits that stack; the margin footer explicitly uses `ui-sans-serif, system-ui, sans-serif`. Distinct heading/row/metadata sizes remain in v6 print rules. The manually edited PDF examples use an Arimo/Helvetica mix and a rasterized emblem approximation, so **they do not prove exact application font or pixel-perfect official logo fidelity**. Do not treat those examples as source-of-truth renders.

The print-level color treatment is not an assertion that any category is in a success, warning, or error state. The existing `.pm-print-surface` implementation is untouched. No further brand palette or typography restructuring is authorized here.


## Isolated CI recovery and real-component test evidence (21 October 2026)

**Scope and releases:** `main` remains at `943326ed529a205ffb5260035d1c0cb3ef00d35c`. PR #461 remains **draft/unmerged**. No production access, secrets, allocation logic, global print tokens, or server entitlement code were changed.

### Dependency lock recovered in separately reviewed draft PR #462
- The baseline `package.json` declares `react-helmet-async@^3.0.0` but `package-lock.json` lacked the root entry and four installed packages.
- An isolated GitHub Actions runner regenerated the lock with `npm install --package-lock-only --ignore-scripts` and verified `npm ci --no-audit --fund=false` **passed** (488 packages).
- The resulting [draft PR #462](https://github.com/tushar1669/prize-manager/pull/462) changes **only `package-lock.json`** (36 changed lines), adding the expected root entry and four exact versioned packages with registry integrity hashes. No guard was bypassed or disabled, and the temporary regeneration workflow was removed.
- Ordinary PR #462 CI subsequently passed `npm ci` but **failed the pre-existing `assert:no-csv` guard**, before build/lint/unit/e2e. Its logs show matches in baseline `bun.lock` hash, documentation (including statements of the no-CSV requirement) and an existing XLS/XLSX validation message. This is a separate CI false-positive/guard-semantics issue; it has not been silently fixed or weakened.

### Direct React fixture / real Chromium print test (unmerged isolated QA branch)
A separate branch `qa/category-cards-v6-integration-20261021` combines unchanged v6 screen and component sources from PR #461 with the exact lockfile from PR #462 **without merging either PR**. The Vite dev server compiles the real `CategoryCardsView` and `CategoryCardsUpdatedView` modules together and renders them with non-PII synthetic `FinalPrizeCategoryGroup` data. It does not exercise the real authenticated tournament page, Supabase calls, production access controls or route navigation.

- `npm ci`: **passed**.
- `npm run build`: **passed**.
- Playwright: **3 of 4 targeted checks passed** in the latest test iterations: winner name/place/amount parity for v1 versus v6; restricted main preview/non-main locked categories; no-gift table and category color differentiation.
- The long A4 fixture prints **90 unique synthetic winners across 13 pages**, confirmed using `pdftotext`. Footer text `DERA Tech` appears on all 13 pages and page `N / 13` counters are present for all pages. Chromium reports `594.96 × 841.92 pt`, matching nominal A4 with normal rounding.
- **Real defect found:** PR #461's `@page` margin-box `background-image` does not embed the official logo at all (`pdfimages -list` reports no images). An experimental `image-set(content)` margin-box alternative also fails.
- A separate experimental, fixed-position **normal React `<img>`** using the unchanged official `/brand/prize-manager-logo-transparent-cropped.png` embeds the image on printed pages **2 through 13, but not page 1**. This remains true when the fixture reproduces the application's preload link and the test awaits `HTMLImageElement.decode()`. The stricter each-page image verification therefore **fails**. See [run 39486137187](https://github.com/tushar1669/prize-manager/actions/runs/39486137187) and [run 39486452033](https://github.com/tushar1669/prize-manager/actions/runs/39486452033).
- **Do not copy the experimental footer into PR #461** or claim branding complete: first-page logo coverage has not passed. Generated PDF artifacts are available in those runs for inspection (synthetic fixtures only).
- The synthetic React checks provide stronger evidence than earlier handmade HTML/PDF previews, but they are **not full authenticated application verification** and do not prove that every real-world category length, print setting or entitlement is safe.

**Release status:** **BLOCKED / NOT VERIFIED** pending reliable official-logo embedding on **every** A4 page, full route-level entitlement and print checks, and required lint/unit/CI gates. Maintain legacy v1 as default. B8b remains IN_PROGRESS and D2 outstanding. Do not merge or deploy; stop before Poster Grid.


## Latest resolution of every-page official logo (21 October 2026) — supersedes earlier footer blocker

**Current outcome:** The previously documented **first-page logo blocker is resolved for fixture-backed Chromium A4 printing**. This is not full authenticated production/release verification.

### Reproduction, rejection and accepted implementation
1. On isolated `qa/category-cards-v6-integration-20261021`, real Chromium PDFs confirmed that fixed-position <img> could be embedded but the logo was clipped at the bottom and wrongly repeated near the top of pages. **Embedding alone was not accepted as a pass.**
2. A true `@page pm-category-cards-v6 @bottom-left { content: url(...); }` repeated the unchanged logo on every page but printed the **1221px intrinsic image at 96 dpi**, visibly huge and cropped. That candidate was rejected after raster inspection.
3. An A4 margin-box `content: image-set(url("/brand/prize-manager-logo-transparent-cropped.png") 10x)` scaled the same transparent original to print-footer size; the margin box's separate navy background preserves contrast without changing the logo file. Final CSS also has text fallback `content: "Prize Manager"` for browsers that do not support `image-set`. No print derivative assets or duplicate logos were introduced.
4. The accepted CSS bytes in `src/components/final-prize/CategoryCardsUpdatedView.css` were copied **unchanged** from the successful QA branch into [draft PR #461](https://github.com/tushar1669/prize-manager/pull/461), commit `26d74ea998e1332c2d5608c2f2b3a78266d14a2c`. Legacy v1 and `.pm-print-surface` remain unchanged.

### Verified fixture evidence
- [Isolated real-component Chromium test run 39488985415](https://github.com/tushar1669/prize-manager/actions/runs/39488985415): `npm ci` **PASS**, Vite build **PASS**, **4/4 Playwright cases PASS**. Synthetic React v1/v6 parity: winner names, places, amounts and locked-preview behavior; gift vs no-gift layout and category colors.
- A4 long-content fixture: **13 printed pages, all 90 synthetic winners, 13 repeated company/footer texts and 13 page counters**. `pdfimages -list` lists the same 1221×346 official transparent PNG as an image **on every page**, at ~961×949 ppi effective resolution (about 34mm wide). Automated bounds tests confirm no extracted text lies outside the A4 media box.
- No-gift multi-category fixture: **2 A4 pages**, official image on each page, color-differentiated category headings and zebra rows, expected category titles present.
- Downloaded the generated runner artifact and **visually inspected page 1, page 2, page 13 and the no-gift first page**. Logo is entirely visible in the bottom-left navy block; it is not cut off or duplicated over winner rows. Visual check does not establish all possible tournament text combinations or cross-browser fidelity.
- PDF fixture artifact: [runner 39488985415](https://github.com/tushar1669/prize-manager/actions/runs/39488985415) → `category-v6-real-react-a4-pdfs`. Fixture source and assertions remain on the isolated QA branch; fixture route is not shipped in PR #461.

### Additional quality gate results
- [Isolated quality test run 39489510579](https://github.com/tushar1669/prize-manager/actions/runs/39489510579): `npm ci` **PASS**, `npm run build` **PASS**, `npm run typecheck` **PASS**, `npm run test:unit` **PASS** (**548 unit tests; 62 spec files**).
- `npm run lint` **FAILS** with **19 errors / 10 warnings** in paths unrelated to v6 (including `useManualPrizes.ts`, `useMartechDrilldown.ts`, `previewAuthStorage.ts`, `PublishSuccess.tsx`, `publicTournamentDetails.ts` and Supabase extraction files). The isolated QA workflow fails rather than bypassing lint; it does **not** claim successful full CI.
- Standard [draft lockfile prerequisite PR #462](https://github.com/tushar1669/prize-manager/pull/462) now passes `npm ci` but stops on the separate existing `assert:no-csv` text-scan guard. Neither that guard nor lint rules were weakened.

**Release state: IMPLEMENTED / PARTIALLY VERIFIED / NOT RELEASED.** A4 logo print defect **resolved for the tested Chromium scenarios**; remaining explicit blockers are repository-wide lint and guard CI failures, plus authenticated application route-level and other browser/print-setting entitlement verification. No merge, deployment or production access. Keep B8b IN_PROGRESS and D2 outstanding; do not start Poster Grid.
