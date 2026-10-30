# 30 October 2026 — Reports-only Excel and A4 release evidence

**Repository:** tushar1669/prize-manager. **Release candidate:** [#485](https://github.com/tushar1669/prize-manager/pull/485). **Production status:** pending exact SHA/environment verification; code in PR alone does not prove deployment.

## Owner-selected scope and rationale
Split previously approved report layouts out of frozen Team Prizes V2 so no new ranking engine, official-ruling Save, canary SQL or production migration is deployed as a report dependency.

- Styled Final Prize XLSX: **Winners, Poster Grid, Arbiter Sheet, Team Prizes** (read-only recorded team awards).
- Styled AllocationCoverage + RCA XLSX separate export.
- Browser A4 layout for Category Cards — Updated, Poster Grid, Arbiter Sheet and Team Prizes, with confidential diagnostics hidden from printed pages.
- Existing `generatePdf` response contract remains JSON with a `data:text/html;base64,` printable HTML payload; a browser can Print / Save as PDF. It does **not** return binary PDF bytes.
- Team awards and server report are pinned to the requested saved allocation version; missing saved team awards never trigger new live prize allocation.
- Existing owner/Master full-access and publication security guardrails retained. No new database object, migration, payout or auth role changes.

## Tests and outstanding evidence
- [Scoped actual XLSX and Chromium A4 QA](https://github.com/tushar1669/prize-manager/actions/workflows/integrated-report-qa.yml) exercises real source modules, generated workbooks, actual browser print PDFs, privacy masking and printable Edge HTML with synthetic fixtures.
- [Full CI](https://github.com/tushar1669/prize-manager/actions/workflows/ci.yml) retains the normal lint, unit, format guard and Playwright checks. Any missing authenticated Swiss QA backend must remain a reported failure, never relabeled green.
- Before release: record exact source SHA, all relevant outcomes and any failures; test the public navigation smoke and report layout on the same commit.
- After release: verify Lovable editor SHA, published site, and `generatePdf?ping=1` build marker. If evidence unavailable, label runtime UNKNOWN.

## Rollback
If actual reports regress after deployment, revert only PR #485's report code, inspect that main auto-deployment finished, verify old report rendering and version-pinned access, and keep historical data untouched. No SQL rollback needed for this changeset.

## Separate Team V2 handoff
[#484](https://github.com/tushar1669/prize-manager/pull/484) stays draft, with new Save disabled and per-event canary unapplied. Follow-up remains a separate coherent workflow; do not reintroduce old monetary ranking or treat synthetic tests as production verification.
