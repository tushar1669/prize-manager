# Prize Manager — Active release pointer
**Updated:** 30 October 2026. **Canonical item ID/priority:** UNKNOWN (not owner-assigned).

## Current coherent item: Excel/XLSX and A4 printable handouts
- Status: Reports-only source candidate in [PR #485](https://github.com/tushar1669/prize-manager/pull/485); publication verified only after exact deployed ref and runtime checks.
- Scope: branded four-sheet Final Prize workbook (Winners, Poster Grid, Arbiter Sheet, Team Prizes), separate Coverage/RCA report, styled browser A4 printable pages and server HTML printable A4 report.
- Data: read-only export of saved individual/team awards and version-pinned historical snapshots; no new ranking, allocation logic, schema migration or team prize saving.
- Gate: existing AGENTS.md build/lint/unit and relevant browser report/public navigation QA; do not misrepresent an unrelated authenticated E2E preflight as a passing workflow.
- Recovery: revert the reports-only code release if deployed print/export errors occur. No database migration is bundled.

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
Finish the reports-only PR verification; if scoped gates pass, release that PR using the owner's authorization, confirm deployed frontend and report Edge endpoint, then record exact runtime evidence. Team V2 stays frozen.
