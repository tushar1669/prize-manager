# 30 October 2026 — Reports-only Excel and A4 release evidence

**Repository:** tushar1669/prize-manager. **Release candidate:** [#485](https://github.com/tushar1669/prize-manager/pull/485). **Production status:** Reports-only merged to main on 30 October 2026 as `6af6e89bccfe50a39881fd58664d0afc1c71a79e`. Lovable editor SHA verified matching main; explicit Lovable Publish returned deployment ID `43cf3d85-e907-4f7c-880b-b94d5465bf59` with PENDING status, not independently verified as complete. Production Supabase `generatePdf` v361 ACTIVE; unauthenticated ping URL could not be independently fetched; live authenticated report parity remains UNKNOWN.

## Owner-selected scope and rationale
Split previously approved report layouts out of frozen Team Prizes V2 so no new ranking engine, official-ruling Save, canary SQL or production migration is deployed as a report dependency.

- Styled Final Prize XLSX: **Winners, Poster Grid, Arbiter Sheet, Team Prizes** (read-only recorded team awards).
- Styled AllocationCoverage + RCA XLSX separate export.
- Browser A4 layout for Category Cards — Updated, Poster Grid, Arbiter Sheet and Team Prizes, with confidential diagnostics hidden from printed pages.
- Existing `generatePdf` response contract remains JSON with a `data:text/html;base64,` printable HTML payload; a browser can Print / Save as PDF. It does **not** return binary PDF bytes.
- Team awards and server report are pinned to the requested saved allocation version; missing saved team awards never trigger new live prize allocation.
- Existing owner/Master full-access and publication security guardrails retained. No new database object, migration, payout or auth role changes.

## Release verification (actual facts)
- [Report-only scoped CI 41057721544](https://github.com/tushar1669/prize-manager/actions/runs/41057721544): SUCCESS, workbook, browser Chromium A4, printable Edge HTML synthetic data.
- [Full CI 41057721549](https://github.com/tushar1669/prize-manager/actions/runs/41057721549): OVERALL FAILURE at authenticated Swiss-import suite (separate QA backend missing). CSV guard, build, lint, unit tests and public smoke PASS. No tests were weakened, skipped artificially or rerouted to production.
- GitHub PR #485: merged as `6af6e89bccfe50a39881fd58664d0afc1c71a79e`, no migrations, no Team V2 Save deployment or activation.
- Lovable project `ee2c255e-4041-44cb-8cca-2353ed6c5c8d`: editor latest SHA matches main and is_published true; explicit deploy returned pending, so live publish completion not yet proved.
- Supabase project `nvjjifnzwrueutbirpde`: `generatePdf` deployed and ACTIVE at version 361 (previous version 360). No Team V2 migrations or `saveTeamV2` deployed.

## Tests and outstanding evidence
- [Scoped actual XLSX and Chromium A4 QA](https://github.com/tushar1669/prize-manager/actions/workflows/integrated-report-qa.yml) exercises real source modules, generated workbooks, actual browser print PDFs, privacy masking and printable Edge HTML with synthetic fixtures.
- [Full CI](https://github.com/tushar1669/prize-manager/actions/workflows/ci.yml) retains the normal lint, unit, format guard and Playwright checks. Any missing authenticated Swiss QA backend must remain a reported failure, never relabeled green.
- Before release: record exact source SHA, all relevant outcomes and any failures; test the public navigation smoke and report layout on the same commit.
- After release: verify Lovable editor SHA, published site, and `generatePdf?ping=1` build marker. If evidence unavailable, label runtime UNKNOWN.

## Rollback
If actual reports regress after deployment, revert only PR #485's report code, inspect that main auto-deployment finished, verify old report rendering and version-pinned access, and keep historical data untouched. No SQL rollback needed for this changeset.

## Separate Team V2 handoff
[#484](https://github.com/tushar1669/prize-manager/pull/484) stays draft, with new Save disabled and per-event canary unapplied. Follow-up remains a separate coherent workflow; do not reintroduce old monetary ranking or treat synthetic tests as production verification.
