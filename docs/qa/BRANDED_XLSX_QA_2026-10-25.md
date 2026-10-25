# Branded report XLSX — isolated QA and release gates (25 October 2026)

**Status:** scoped styling + report-only isolation **VERIFIED on exact source commit** `2f0f9ddfd213ad46ae5b5692757cb4fa79f626b6`. **Production/release UNVERIFIED and NOT AUTHORIZED**. Existing draft PR [#477](https://github.com/tushar1669/prize-manager/pull/477), stacked on unmerged lockfile prerequisite [#462](https://github.com/tushar1669/prize-manager/pull/462); no main merge or deployment. Priority ID UNKNOWN: BACKLOG.md absent from main.

## Scope and rationale

- Preserve **exact** individual Final Prize `Winners` / `Poster Grid` / `Arbiter Sheet` workbook headings, values and order, with branded gold/navy/teal styling (the independent Team Prizes fourth worksheet comes from draft #478 and is not present in this branch).
- Preserve **Coverage = filled + unfilled** and **RCA = unfilled only** semantics. No extra columns or CSV.
- **25 Oct correction:** Generic `downloadWorkbookXlsx` also writes import error and conflicts files, so blindly switching it to a styled writer exceeded the report-only intended scope. At `2f0f9ddf`, a pure `isBrandedPrizeReportSheetSet` allowlist limits the forked `xlsx-js-style` report writer to exactly the existing three-sheet Final Prize shape, the future four-sheet shape, and individual `AllocationCoverage`/`RCA` workbooks. Every other combination keeps the original `xlsx` SheetJS writer. Added positive and negative tests for diagnostic sheets and the future fourth sheet. The report-only styling fork must never become the parser for untrusted imported player spreadsheets.
- Historic/unrelated data remain unmodified. Four-sheet Team XLSX ranks remain **BLOCKED** by team Rank Sum v2 scoring policy and safe data ingestion; approved Team A4 visuals in #478 remain unchanged.

## Exact run and evidence

[Run **40190647920**](https://github.com/tushar1669/prize-manager/actions/runs/40190647920), job `xlsx`, **completed SUCCESS** on source commit `2f0f9ddfd213ad46ae5b5692757cb4fa79f626b6`. Observed step results:
- `npm ci --no-audit --fund=false` — PASS;
- targeted `vitest` branded workbook / final-prize export / RCA suites — PASS (steps, not claimed global unit coverage);
- targeted `eslint` — PASS;
- `npm run build` — PASS;
- generated workbook OOXML `xl/styles.xml` zip inspection for gold `B38A32`, teal `1F6E5B` and RCA diagnostic `99571F` — PASS;
- synthetic fixture artifact `styled-xlsx-synthetic-fixtures` **12597711762**, retained: [artifact API record](https://api.github.com/repos/tushar1669/prize-manager/actions/artifacts/12597711762).

The targeted QA run and workbook ZIP artifact **do not prove visual opening in desktop Excel/LibreOffice, workbook formula/merged-cell semantics, historical authorizations, authenticated end-to-end downloads, all-browser compatibility, FEXP Team fourth-sheet composition, or successful full CI**. These remain verification gates. The separate complete CI prerequisites #462 lockfile, #463 no-CSV guard and #466 inherited lint remain unmerged; do not mark full pipeline green. Report-only style package `xlsx-js-style@1.2.0` is a legacy SheetJS fork; supply-chain maintenance/security acceptance must precede release.

## Post-test cleanup

The temporary GitHub Actions workflow `.github/workflows/xlsx-lock-generator-20261024.yml` was **deleted on draft-only commit `29efaa78bf3ecef843503948cfb8d2f744b701ae`** AFTER the successful tested commit, per PR's earlier cleanup gate. The deletion does not modify the tested TypeScript implementation; no new workflow-run success is claimed for cleanup commits.

## Dependency advisory follow-up — separate security gate

Current repo's **existing** npm `xlsx@0.18.5` reader is historically affected by the crafted-file **prototype pollution** [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) and **ReDoS** [CVE-2024-22363](https://advisories.gitlab.com/pkg/npm/xlsx/). The official SheetJS advisory explicitly says output-only workflows are not affected by the prototype-pollution reading pathway; this draft keeps `xlsx-js-style` on **writing only** and the existing import-reader code unchanged. `xlsx-js-style@1.2.0` is assessed [inactive by Snyk](https://security.snyk.io/package/npm/xlsx-js-style), despite no direct advisories in that database. **Do not assert the fork is patched or clear a security review based only on targeted tests.** The pre-existing import-reader risk merits separately authorized dependency assessment/remediation (out of this styling PR's scope); do not quietly swap import parsers or weaken validation here.

## Next exact action

Review actual **synthetic XLSX fixture files** for worksheet visual legibility in a real spreadsheet application and verify maintained reporting dependency/security. Then (in a separate coherent task) integrate the distinct draft #478 Team fourth worksheet only after the verified ranking policy and historical version compatibility are ready. No merger, deployment or publish permission from this QA approval.
