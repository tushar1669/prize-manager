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
