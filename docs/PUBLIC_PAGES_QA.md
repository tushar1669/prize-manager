# Public Pages – Production QA Checklist

Quick regression tests for public-facing tournament pages.

---

## Home Page (`/`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1 | Page loads without errors | No console errors, no blank screen |
| 2 | Tournament cards render | At least one card visible (or "No published tournaments" message) |
| 3 | Each card shows title, dates, location | All three fields populated, no "undefined" |
| 4 | "View Details" button present | Button visible and clickable on each card |
| 5 | Load time acceptable | Cards appear within 2 seconds |

---

## Tournament Details (`/p/:slug`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 6 | Navigate from home → details | Click "View Details" → URL changes to `/p/{slug}` |
| 7 | No error toast | "Unable to load tournament details" does NOT appear |
| 8 | Title + dates display | Tournament name and date range visible in header |
| 9 | Venue/city display | Location info shown (or gracefully omitted if empty) |
| 10 | Back button works | Click back → returns to `/` |

---

## Results Page (`/p/:slug/results`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 11 | Direct navigation works | Go to `/p/{slug}/results` → page loads |
| 12 | Empty state or results table | Shows "No results" message OR populated table |
| 13 | Back button works | Returns to home (`/`) |

---

## Cross-Cutting

| # | Check | Pass Criteria |
|---|-------|---------------|
| 14 | Browser back/forward | History navigation works, no stale data |
| 15 | Mobile responsive | Cards and details readable on 375px width |

---

## Quick Smoke Test Flow

```
1. Open /
2. Verify tournament list loads
3. Click first "View Details"
4. Verify details page shows title, dates, venue
5. Navigate to /p/{slug}/results
6. Verify results or empty state
7. Click back → home
8. Browser back/forward → no errors
```

**Last updated:** 2024-12-26

See also: [Deploy and Publish Runbook](./DEPLOY_AND_PUBLISH.md) for pre/post publish checks.


## Issue #459 — Team Prizes public guide (draft only, 10 October 2026)

- Source scope: `src/pages/public/HowItWorks.tsx`, `src/components/public/SiteFooter.tsx` and `public/guides/team-prizes-organizer-guide-2026-10.pdf` plus the targeted Playwright smoke test.
- PDF provenance: owner-supplied final branded 18-page file `Prize_Manager_Team_Prizes_Organizer_Guide (2).pdf`, 724857 bytes, SHA256 `6129f0ed1fa6e5d5508da31be7743929d9758ed3387044eef64ba844b1fdef11`; source PDF left unchanged. Authentic Resolve Tie / Save Resolution capture was not achieved (explicit on cover, pages 13, 17–18); no claim of end-to-end tie UI verification.
- Source checks: `e2e/team-prizes-guide.spec.ts` (`@smoke`) asserts public route, mobile footer hash, PDF HTTP 200 in Vite preview, `application/pdf`, expected byte length and `%PDF-` header.
- **Not yet verified:** CI results, keyboard and manual mobile download/browser visuals, authorized production deployment, public production PDF HTTP 200 / MIME / bytes, auth/pricing regressions. The draft PR must not be merged/published without a release decision and appropriate QA.
- Static asset must be served directly as PDF; a Vite HTML SPA fallback response does **not** count as asset verification.

### Draft PR #460 validation — 11 October 2026 (Issue #459 only)

- **Repository integrity verified:** GitHub branch blob `9126ab04294f390f9eb617fa04f0617ec558f542`, 724857 decoded PDF bytes, `%PDF-1.7` header and `%%EOF` trailer. Computed SHA-256 `6129f0ed1fa6e5d5508da31be7743929d9758ed3387044eef64ba844b1fdef11` matches the approved organizer PDF. This verifies the **branch asset**, not HTTP content-type or browser rendering.
- **CI run [38081656357](https://github.com/tushar1669/prize-manager/actions/runs/38081656357): FAILED before tests.** `npm ci` exits `EUSAGE`: package.json/lock mismatch, missing lock entries `react-helmet-async@3.0.0`, `invariant@2.2.4`, `react-fast-compare@3.2.2`, `shallowequal@1.1.0`. Neither manifest is changed by PR #460, so treat this as an inherited CI prerequisite, **not** a passing website test. Build, lint, unit, smoke, Swiss, allocator and UX jobs were skipped.
- **Added automated coverage (not executed):** exact PDF SHA-256 check, a Chromium 320px horizontal-overflow assertion, and Enter-key activation of the PDF link with actual browser download event and filename. Existing tests cover public section, footer fragment navigation, HTTP 200, `application/pdf`, PDF signature and 724857-byte response. These remain **PENDING** until a clean CI/preview run.
- **Manual/preview gates remain pending:** 320px and 375px screenshot/layout QA, keyboard focus and tab order, mobile download in real browser, public pricing and organizer sign-in regression, preview HTTP response and MIME. No public release or production URL assertion is made; unmerged branch assets do not prove live production delivery.
- **Permanent documentary limitation:** authentic Resolve Tie and Save Resolution screenshots are not available; the original guide, the website download note, and this QA status retain that limitation. Do not mark tie workflow verified.
- **Scope decision:** do not alter `package-lock.json`, app behavior, auth, allocation, database or deployment under this scoped website test/documentation update. CI prerequisite must be resolved via an authorized dependency-consistency change before release approval.
