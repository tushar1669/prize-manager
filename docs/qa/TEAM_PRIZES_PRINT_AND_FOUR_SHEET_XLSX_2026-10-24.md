# Team Prizes — A4 print and fourth Final Prize XLSX sheet (24 October 2026)

**State:** owner-approved implementation scope **IMPLEMENTED**, targeted synthetic fixture QA **VERIFIED**, owner **visual review PENDING**, required full CI **BLOCKED** on separate existing guards. Draft [PR #478](https://github.com/tushar1669/prize-manager/pull/478); exact implementation source ref `41dafa599276c8bc556ff59adf7d5cf33a855aae` (subsequent documentation-only commit may advance the PR head). **No merge, deployment or draft-state transition authorization.**

## Owner decision

The owner expressly chose **B**, adding **Team Prizes as a fourth worksheet** of the existing Final Prize XLSX, and instructed Team Prizes print styling to be the first outstanding export design item before the three individual sheets, Coverage and RCA polishing. Scope excludes changes to allocation, team scoring, individual prize rows, entitlements, source/result versions, public data, or generic XLSX/CSV policy.

## Actual current draft behavior

- Existing two organizer **Export XLSX** buttons (Finalize and Final Prize header) now share `src/utils/finalPrizeWorkbook.ts`, producing `Winners`, `Poster Grid`, `Arbiter Sheet` and `Team Prizes` in that order. The first three sheets remain the previous raw award rows, and Arbiter alone adds a blank Signature. **The overall Excel visual restyling is a separate next task.**
- `Team Prizes` has one row for each **filled team award**: Prize Group, Place, Team / Institution, Team Players (with ranks), Points (blank only when the UI would report points absent), Rank Sum, Best Rank, Cash Amount (number), Trophy, Medal. It does not include ineligible institutions, unfilled awards, raw diagnostics or preview-masked top teams.
- No team groups: the fourth sheet exists but has no rows. Configured groups with missing team results: export **fails closed** and shows an actionable error; it does not silently produce an incomplete team sheet.
- Team-only awards may download with 0 individual-winner rows. The existing full-access gate is enforced before any query or write; count queries / versioned team fetch reuse the existing Team Prizes data path. Finalize passes its own team-allocation selector; Final Prize header uses the same unversioned/latest selector as its Team Prizes tab.
- The Team Prizes PDF remains the **browser Print → Save as PDF** flow. `TeamPrizesTabView.css` is print-scope-only and sets restrained gold/teal/navy backgrounds for award groups; visible column/row rules, stronger place typography, repeating table headers, readable team rosters and no organizer-only ineligible lists on paper. The underlying six printed columns and award calculations are unchanged. Team group order determines gold→teal→navy cycle.

## Verified evidence

- [Isolated QA run 40122220957](https://github.com/tushar1669/prize-manager/actions/runs/40122220957) on unmerged temporary [draft #479](https://github.com/tushar1669/prize-manager/pull/479), based on the *separate* draft lockfile prerequisite #462, using exact source-equivalent Team implementation files and tests from #478.
- **15/15 Vitest tests PASS across three suites** (Team four-sheet builder/access/fail-closed, existing team masking, existing final winner mapper). Targeted ESLint **PASS**, Vite build **PASS**, **4/4 Chromium Playwright PASS** (short/long real React TeamPrizeResultsPanel print, masked winner and expanded-organizer-only ineligible diagnosis hidden from print). `npm ci` PASS.
- Synthetic A4 artifacts: **12 team prizes over 2 pages** and **42 team prizes over 6 pages** with distinct gold/teal/navy group backgrounds. Verified PDFs are A4 via `pdfinfo`, and `pdftotext` found **12/12 and 42/42** synthetic institution names. First/second short pages and last long page were visually checked for grid, readable names and absence of clipped column headers. Synthetic long case uses positive prize amounts.
- Normal required CI on implementation PR remains **NOT GREEN** due to unrelated `package-lock` / strict CSV guard prerequisites; no overall pass or runtime deployment inference. The exact QA branch and main may differ in non-Team files (QA uses preexisting #462 lockfile), so source-equivalence is **specific to the changed files** and targeted tests, not a full merge-base integration claim.

## Remaining gates and rollback

1. Owner reviews two synthetic Team A4 PDFs and approves or requests one design correction.
2. Next coherent export item is **Final Winners XLSX visual polish**, which should retain the new Team Prizes fourth sheet and preserve data/access guarantees. Later separate items: Allocation Coverage XLSX and RCA XLSX.
3. After export work, address locked no-CSV guard, lint, relevant unit/e2e, authenticated end-to-end and release checklist. Do not weaken guardrails or use production fixture data.
4. #478 remains **DRAFT, UNMERGED, UNDEPLOYED**. If rejected, close the isolated draft PR. No migration, auth/role change or production rollback required because no deployment happened.

**Missing authority:** `SOURCE_OF_TRUTH.md`, `BACKLOG.md`, `DOCUMENT_INDEX.md`, `QA_STATUS.md` and `EVIDENCE_REGISTER.md` were not found on `main`; priority and backlog ID remain **UNKNOWN**. Do not manufacture them or turn visual approval into release authorization.


## Owner-requested print alignment and metadata refinement — 25 October 2026

**Feedback:** Center the Team Prizes award-group titles **and all six prize-table column headers**, and replace generic blue metadata pills with **filled, readable color-coded badges** for `Grouped by`, `Top X players`, `Rule` (when present), `X eligible teams`, and `X winners • prize total`. Make the summary winner/group badges use neutral brand gold, not blue. No data, calculations, scoring, permissions or Excel logic changes.

**Implemented in existing draft PR #478:** `TeamPrizeResultsPanel.tsx` adds style-only badge classes and summary wrapper; scoped `TeamPrizesTabView.css` centers group/table headings and applies **gold first group, teal second, navy third; repeat every three groups** to each badge's entire background, text, and border. The color varies **by prize group** and is not an award-ranking signal. It applies only inside `.pm-team-prizes-print`, leaving shared allocation and public views unstyled. Backgrounds are print-color-adjusted and labels remain readable without color.

**Exact QA evidence:** [run 40124275232](https://github.com/tushar1669/prize-manager/actions/runs/40124275232) on reused temporary draft QA #479, using **blob-identical** updated Team component and CSS. `npm ci` PASS, **15/15 Vitest** PASS, targeted ESLint PASS, Vite build PASS, **5/5 React/Chromium** PASS; the new browser assertion checks actual computed centered `thead th` and group `h3`, and all four colored group metadata badges in gold/teal/navy plus gold summary badges. Existing tests continue checking hidden first-place preview winners and expanded organizer ineligible diagnostics **not printed**.

**Pagination regression found and fixed:** First enlarged pill-spacing fixture yielded **12 synthetic teams / 3 pages**, with one orphaned final row on page 3. Reduced **print-only** row and badge padding without changing values or typography; final regenerated browser PDFs are **12 team awards / 2 A4 pages** and **42 / 5 A4 pages**, with **12/12 and 42/42** institution labels in text extraction. Visually inspected short A4 pages 1–2 and long page 5: centered headings, matching pastel pills, readable tabular values, intact grid and no orphan page. Artifact `team-prizes-a4`, ID `12571983667` on that exact run.

**Lifecycle:** targeted design refinement **IMPLEMENTED / fixture-VERIFIED / owner visual signoff PENDING**. Previous Team PDF design was not yet signed off; the owner requested this change instead. Normal full CI still **NOT GREEN** at independent legacy prerequisites #462/#463/#466. No merge/deployment/draft-state change authorization; #478 stays open draft and #479 is temporary evidence-only.


## Final rupee/amount and numeric-centering correction — 25 October 2026

**Owner's bounded request:** Keep all approved Team A4 design and color sections unchanged; fix only (1) potential glyph collision between **₹** and cash digits, (2) horizontal centering of **Points, Rank Sum, Best Rank and Prize** values, and (3) a clear space between printed cash and **trophy/medal icons**.

**Source change limited to existing draft #478:** `TeamPrizeResultsPanel.tsx` uses a presentation-only `TeamCash` span with separate ₹ symbol and Indian-grouped numeric digits; existing `formatCurrency` value remains the accessibility label, and award amount/points calculations do not change. `TeamPrizesTabView.css` uses scoped `.pm-team-prizes-print` rules: center the three numeric stat cells and Prize value, ensure a measured **0.9mm symbol-to-digits gap** and a **2mm cash-to-award-icon gap** with **1.2mm between icons** in A4 print. Larger currency totals in the existing info/summary badges use the same distinct glyph spacing. This does not change other allocation/public result views, the four-sheet Excel workbook, or source data.

**Verification:** Reused unmerged #462-lockfile-based temporary QA #479 with exact matching blobs for the two modified Team files. [Run 40126745877](https://github.com/tushar1669/prize-manager/actions/runs/40126745877) **SUCCESS**: `npm ci` PASS, **15/15 Vitest** PASS, targeted lint PASS, build PASS, **6/6 Chromium print/access tests** PASS. New browser check measures actual DOM rectangles to assert ₹-to-digits gap **greater than 1 px**, cash-to-trophy separation **greater than 5 px**, all four numeric/prize columns **centered**, and icons remain inside the prize column.

**Rendered synthetic PDF evidence:** run artifact `team-prizes-a4` ID `12573202933`: 12 awards **2 A4 pages**, 42 awards **5 A4 pages**, same as prior revision; `pdftotext` found **12/12 and 42/42** distinct institutions. Viewed regenerated short page 1; rupee/digits and award symbols no longer collide. This is **synthetic fixture QA**, not overall CI or deployed runtime evidence.

**Release control:** Implementation remains **DRAFT / UNMERGED / UNDEPLOYED**. Owner final visual review of this narrow revision is pending; do not infer merge/deployment permission. Normal repo CI and #462/#463/#466 blockers are separate; continue next export-item workflow only after owner visual review.


## Owner visual signoff and Rank Sum definition — 25 October 2026

**Visual decision:** Owner replied **“Approved.”** to the final A4 rupee-spacing, centered numeric/prize values, and trophy/medal spacing revision. The design of the Team Prizes PDF is **OWNER VISUALLY APPROVED**, in addition to synthetic QA verification. No approval for merge, deployment, public publishing, or changing draft state. Excel formatting for the existing three final-winner sheets plus new fourth Team Prizes sheet is the next separately reviewable output.

**Authoritative `Rank Sum` behavior:** `supabase/functions/_shared/teamPrizes.ts` computes `rank_sum = sum(p.rank)` for the **selected `team_size` players**, not all players enrolled by an institution. The selected pool is the highest individual tournament ranks (smallest rank numbers) subject to configured minimum gender slots. Example: selected player ranks #2, #6, #9 produce Rank Sum **17**. A **smaller Rank Sum is better**. The live compute comparator orders institutions by `total_points` (sum of the selected players' **raw** `players.points`, descending), then `rank_sum` ascending, then `best_individual_rank` ascending, and finally the institution key alphabetically. When point values are absent, the computed total becomes 0; rank sum can therefore determine team order among zero-score teams. The UI's `Points —` footnote appears only where `players_without_points` diagnostics exist; persisted snapshots may present 0 instead. The persisted results reader `src/components/team-prizes/useTeamPrizeResults.ts` derives the displayed Rank Sum again from the selected `player_snapshot`, and the new fourth Team Prizes XLSX sheet copies `winner.rank_sum` without recomputation.

**Display decision:** The algorithm **needs Rank Sum**, but the printable table does not technically need to expose that intermediate value to compute results. Retain the existing column for explainability and tie-break transparency pending an explicit owner decision; a future label such as **“Rank Sum (lower better)”** would improve clarity but is not approved or implemented here.

**Documentation drift identified (NOT a product behavior change):** `README.md` and `docs/TECH_OVERVIEW.md` still describe **rank-points** or a `(max_rank + 1 - player_rank)` scoring formula. That conflicts with current scorer code and `docs/team-prizes.md`, which explicitly state **raw `players.points` sum**. Treat source code and the current specialized Team Prizes documentation as authoritative, and correct those two stale descriptions in a separately reviewable documentation-only step. Do not change the scorer to match stale prose or invent production behavior.
