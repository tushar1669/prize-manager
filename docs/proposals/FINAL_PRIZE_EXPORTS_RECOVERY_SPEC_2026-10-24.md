# Final Prize exports — source-verified recovery proposal (2026-10-24)

**Status:** PROPOSED / AWAITING OWNER SCOPE APPROVAL. **Not the recovered historical request, not a backlog item and not authorization to implement, merge or deploy.** Priority / backlog ID UNKNOWN.

**Owner's new scope selection:** “Final prize exports” (no further details). The available-chat record did not preserve the original approved Excel/PDF delta. This proposal is reconstructed from the verified `main` source, not attributed to a lost decision.

**Verified source baseline:** `main` `943326ed529a205ffb5260035d1c0cb3ef00d35c`. Only repository source and existing tests/docs were inspected in this recovery cycle. Runtime deployment, actual downloaded file rendering, browser print appearance and historical requirements are **UNKNOWN**. Draft print designs in PRs #461 and #467 are **not on main**.

## 1. Verified current contract

| Surface | Code / current main-branch behavior |
| --- | --- |
| **Final-winners Excel** | `src/pages/Finalize.tsx` and `src/components/final-prize/FinalPrizeSummaryHeader.tsx` independently construct the same `<tournament>_final_prizes_<UTC date>.xlsx` workbook using `buildFinalPrizeExportRows` and `downloadWorkbookXlsx`. Sheets: **Winners**, **Poster Grid**, **Arbiter Sheet**. The first two reuse the *same* flat winner rows; Arbiter adds a blank **Signature** column. These are data sheets, **not replicas of their visual layouts**. Finalize disables XLSX on Team Prizes tab and when no individual winner rows; full access is required. |
| **Final XLSX columns** | `src/utils/finalPrizeExport.ts`: Category Order, Category Name, Place, Player Name (award markers stripped), Rank, Amount (numeric), Trophy, Medal, Has Gift, Gift Items, Club/Institution, State. This mapper takes rows from `src/hooks/useFinalPrizeData.ts`, which by default resolves organizer's **latest** allocation version; preserve that distinction from public version-pinned outputs. |
| **Workbook helper** | `src/utils/excel.ts` `downloadWorkbookXlsx` calls `XLSX.utils.json_to_sheet` per supplied row list and `XLSX.writeFile(..., { bookType: 'xlsx' })`. There is **no column-emptiness filter in this generic path**. Historical merged PR #124 discussed auto-hiding empty columns; that PR description is not proof that the current final XLSX path implements it. Do not automatically add such behavior without an explicit new decision. |
| **Coverage XLSX** | `src/utils/allocationCoverageExport.ts`: one **AllocationCoverage** sheet, one row for each coverage entry (filled **and** unfilled). Columns include category/label/type/award flags, amount, status, winner name/rank/rating, candidate counts, and diagnosis. Review-stage diagnostic output, not the final-winners workbook. |
| **RCA XLSX** | `src/utils/allocationRcaExport.ts`: one **RCA** sheet containing **only unfilled** prizes, with root cause, eligible/available counts, suggested fix and fail codes; if no unfilled prizes, **no workbook** and caller displays the expected informational message. `docs/EXPORTS_COVERAGE_VS_RCA.md` accurately captures this. `docs/USER_GUIDE.md` and the RCA tooltip currently describe an “engine vs final winner” comparison, which is **not the exported column contract**: this is a verified docs/UI-copy inconsistency. |
| **Print / PDF** | `Finalize.tsx` and `FinalPrizeSummaryHeader.tsx` call **`window.print()`** for the selected view (Category Cards v1, Poster Grid v3, Arbiter Sheet v4; Team Prizes v5 has separate constraints). A saved PDF is the **browser print-to-PDF result**, not an evidenced dedicated downloadable binary-PDF file. `supabase/functions/generatePdf/index.ts` exists but returns **`data:text/html;base64`** under `pdfUrlSigned`, not a binary PDF; repo search did not identify a connected caller from these two Final Prize frontend surfaces. Its owner/master, auth and entitlement checks are present and must not be relaxed. |
| **Pending independent print work** | Draft PR #461 adds opt-in Category Cards v6 without changing legacy v1; draft PR #467 is a visual-only Poster Grid refresh. Both are unmerged and release-pending. Do not assume new behavior on `main`, duplicate those changes, or combine their separate release decisions. |

Relevant prior merged PRs: [#124](https://github.com/tushar1669/prize-manager/pull/124) (CSV→XLSX), [#140](https://github.com/tushar1669/prize-manager/pull/140) (three-sheet final workbook), [#224](https://github.com/tushar1669/prize-manager/pull/224) (Coverage all, RCA unfilled-only). This history grounds existing decisions, **not** an unrecorded new request.

## 2. Bounded proposed change set — not approved

**Recommended first implementation item after owner approval: FEXP-CONTRACT-01, final-exports contract clarification and regression coverage.** Keep this one independently reviewable. It must **not** redesign any output or extend team awards.

1. **Contract and copy alignment (proposed change):** Make docs and on-screen descriptions accurately distinguish (a) the three-sheet final-winner XLSX, (b) pre-finalization Coverage (all prizes), (c) pre-finalization RCA (unfilled only), (d) browser Print → Save as PDF. Replace misleading “engine vs final winners” RCA guide/tooltip wording. No change to the data exported.
2. **Data parity tests (proposed change):** Add isolated fixture-level assertions that final XLSX's **Winners** and **Poster Grid** worksheets contain the same correctly ordered winner rows, that **Arbiter Sheet** adds a blank Signature field, and that amount, gift text, award flags, plain player names and null ranks are handled without silently dropping winners. Verify that each sheet has stable headers for normal datasets. Do not conflate same rows in different sheets with duplicate awards.
3. **Diagnostic regression tests (proposed change):** Coverage exports all filled and unfilled prize entries; RCA exports only unfilled entries; an all-filled state produces no RCA file but does not appear as a technical error. Respect existing plan-gated access paths.
4. **Print-to-PDF contract verification (proposed **QA** task, not a layout redesign):** Verify selected v1/v3/v4 view printed with a suitable non-production synthetic tournament on A4 (long names, multiple categories, gifts, trophies/medals and multi-page content); no missing winner/award rows, no action controls in printable area, readable page breaks. Verify separately against `main`, then against applicable draft print PR refs if those PRs advance to release verification. PDF file shape, browser and page counts must be recorded as fixture evidence. Do **not** change `generatePdf` under this item.
5. **Optional empty-column decision — held separately:** Final XLSX currently includes optional Club/Institution and State fields even when empty. A future owner decision may request omitting columns empty across all winner rows, or keeping a fixed schema for arbiter workflows. **No default choice is authorized by the historical PR text** and no related implementation belongs in FEXP-CONTRACT-01 until decided.

### Explicit exclusions

No allocation computation, prize grouping/deduplication, schema/data/migrations, master/ownership authorization, entitlements, public/pinned-version semantics, team award logic, legacy CSV, export redesign/branding, merging/releasing #461/#467, or new download-PDF service. Do not remove `hasFullAccess` gating. No production test data or PII in fixtures/logs. Separate any later enhancement into its own approved item.

## 3. Evidence, acceptance and safe validation

| Check | Acceptance for FEXP-CONTRACT-01 |
| --- | --- |
| Source behavior | Same three final workbook sheets and same award rows/values before/after (unless a separately approved change explicitly says otherwise). |
| Workbook formatting | XLSX remains Excel-readable; headers/rows stable; award markers absent from Player Name; Signature blank only on Arbiter Sheet. |
| Diagnostics | Coverage all rows, RCA unfilled-only, no-error informational state for zero unfilled. |
| Print | Browser print-to-PDF includes **only active permitted view** and expected winner/award data; no claims about server PDF deployment from source-only inspection. |
| Access/versions | Pro/full-access gates and relevant owner/master server checks preserved; latest organizer vs pinned public outputs not conflated. |
| Tests | New/updated targeted Vitest tests; relevant Playwright synthetic print tests; `npm run lint`, `npm run test:unit`, and current selected e2e per `AGENTS.md`; record pass/fail/skips for exact commit. No weakening checks. |
| Rollback | An isolated, unmerged draft implementation PR can be closed or reverted without production effect; no merge/deploy without separate authorization. |
| Evidence limits | Source verified at `943326e`. No file-generation tests, browser screenshots, CI run or deployed runtime checks were performed for **this documentation-only proposal**. |

Existing direct tests in main: `tests/utils/final-prize-export.spec.ts` verifies award-marker stripping and gift formatting; `tests/utils/allocation-rca-export.spec.ts` verifies no-data, all-filled, write-failure and successful unfilled-only branches; `tests/utils/review-access.spec.ts` covers gated diagnostics. Current tests inspected do **not** prove full generated three-sheet XLSX correctness or A4 PDF appearance. Source review is not a release test.

## 4. Owner decision needed before implementation

**Single approval gate:** Confirm whether **FEXP-CONTRACT-01 (docs/copy alignment + regression tests and synthetic print QA, with NO output layout or column changes)** is the intended first item, or specify the concrete observed defect/output delta instead. If the original request concerned a layout/column change, write one expected before→after example and do not implement this substitute by assumption.

**State:** This proposal is a durable reconstructed plan, NOT historical approval. Priority and backlog ID stay UNKNOWN while `BACKLOG.md` is missing from main. B8b extraction IN_PROGRESS and existing #461/#467 release blockers remain untouched. Keep draft PR #468 open/unmerged; no main push or deployment.
