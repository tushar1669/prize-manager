# Prize Manager — Active release pointer
**Updated:** 5 November 2026. **Canonical item ID/priority:** UNKNOWN (not owner-assigned).

## Released: Excel/XLSX and A4 printable handouts (30 Oct)
- Released to main via [PR #485](https://github.com/tushar1669/prize-manager/pull/485) (`6af6e89`): branded four-sheet Final Prize workbook (Winners, Poster Grid, Arbiter Sheet, Team Prizes), separate Coverage/RCA report and styled browser A4 printable pages. The server HTML report (`generatePdf`) was removed on 3 Nov; the app's PDF is the browser print.
- Owner accepted the printed Category Cards, Arbiter Sheet and Team Prizes layouts on 30 Oct. Print/PDF and Excel stay exactly as approved.
- [PR #486](https://github.com/tushar1669/prize-manager/pull/486) and [PR #487](https://github.com/tushar1669/prize-manager/pull/487): one print renderer for Category Cards, shown as "Category Cards"; `/final/v1` links redirect to `/final/v6`.

## Released: organizer screen look (5 Nov, `c9d653b`)
- Owner decision, 4–5 Nov: on the Finalize and Final Prize screens the four views use the 28 Oct design (the restored `CategoryCardsView.tsx`, screen only) with light column lines and centred columns. Print/PDF, Excel and the public results page keep the 30 Oct designs.
- This reverses, for screens only, the 30 Oct note not to reintroduce the old Category Cards. Do not remove `CategoryCardsView.tsx`.
- Guard: `tests/utils/final-views-screen-print-split.spec.ts`.

## Done: Team prizes (2–5 Nov)
- The separate Team V2 path (draft PR #484, Master canary, separate SQL writer) was removed on 2 Nov (`fafa161`). Team prizes use the usual setup, import, review, finalize and publish flow, with tie-break steps per group; ties are resolved on Finalize.
- Current record: [docs/team-championship/TEAM_PRIZES_STATUS_2026-11-03.md](docs/team-championship/TEAM_PRIZES_STATUS_2026-11-03.md). The 27–30 Oct Team V2 handoff and QA documents are history only.

## Existing queue preserved
- [PROJECT_STATE.md](PROJECT_STATE.md) here is the 28 Sep copy; the owner keeps the current PROJECT_STATE and its addendum in the Claude Project.
- [Post-template V2 backlog](docs/BACKLOG_POST_TEMPLATE_V2.md) contains five non-blocking UX follow-ups.
- Unlisted P0/P1/P2 inventory is **UNKNOWN**, not assumed empty. Do not invent priorities.

## Next exact action
None recorded here. Ask the owner. Do not act on the superseded Team V2 handoff documents.
