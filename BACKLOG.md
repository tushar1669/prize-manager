# Prize Manager — Active release pointer
**Updated:** 30 October 2026. **Canonical item ID/priority:** UNKNOWN (not owner-assigned).

## Current coherent item: Excel/XLSX and A4 printable handouts
- Status: **RELEASED** to main via [PR #485](https://github.com/tushar1669/prize-manager/pull/485), squash commit `6af6e89bccfe50a39881fd58664d0afc1c71a79e`. Lovable editor matches main; explicit Lovable publish triggered (deployment `43cf3d85-e907-4f7c-880b-b94d5465bf59`, status returned PENDING); `generatePdf` Edge Function v361 ACTIVE. External public URL and authenticated live export not yet independently verified.
- Scope: branded four-sheet Final Prize workbook (Winners, Poster Grid, Arbiter Sheet, Team Prizes), separate Coverage/RCA report, styled browser A4 printable pages and server HTML printable A4 report.
- Data: read-only export of saved individual/team awards and version-pinned historical snapshots; no new ranking, allocation logic, schema migration or team prize saving.
- Gate: existing AGENTS.md build/lint/unit and relevant browser report/public navigation QA; do not misrepresent an unrelated authenticated E2E preflight as a passing workflow.
- Recovery: revert the reports-only code release if deployed print/export errors occur. No database migration is bundled.

## Owner-accepted reports: one canonical Category Cards renderer
- Owner confirmed pass of current printed **Category Cards — Updated, Arbiter Sheet and Team Prizes** layouts on 30 Oct. This is print acceptance only, not Team V2 payout correctness or general acceptance of all authenticated exports.
- Duplicate legacy `Category Cards` tab found in the released UI; [PR #486](https://github.com/tushar1669/prize-manager/pull/486) removes the old renderer from Finalize, stand-alone Final Prize and public winner presentations, keeps updated design as first/default, redirects existing `/final/v1` links to `/final/v6`, and updates the print shortcut. No award, database or ranking changes.
- State is **IN_PROGRESS (source)** until merge and verified publication; do not call the correction live just because this branch contains it.

## FROZEN, separate: Team Prizes V2
- Existing [draft PR #484](https://github.com/tushar1669/prize-manager/pull/484) stays DRAFT, unmerged, undeployed.
- No new Team V2 ranking, new awards, Master canary enablement or SQL rollout in #485.
- Continue the existing item in this chat or any later chat only after owner requests it; preserve historical allocation versions, publications and server-side authorization.
- V2 open gates: live database migration/recovery, authenticated Save and official ruling checks, full CI, runtime evidence and owner tournament acceptance.
- The obsolete team payout rules are not authorization to create NEW V2 allocations.

## Existing queue preserved
- [Historical PROJECT_STATE.md](PROJECT_STATE.md) remains authority during incomplete normalization.
- [Post-template V2 backlog](docs/BACKLOG_POST_TEMPLATE_V2.md) contains five non-blocking UX follow-ups, not prerequisites for Excel/A4 delivery.
- Unlisted P0/P1/P2 inventory is **UNKNOWN**, not assumed empty. Do not invent priorities.

## Next exact action
Complete #486 scoped regression and existing CI checks; release/publish the owner-requested Category Cards correction, verify exact live ref, sync release evidence, then hand off exclusively to draft Team Prizes V2 #484. Keep V2 frozen during the UI correction.
