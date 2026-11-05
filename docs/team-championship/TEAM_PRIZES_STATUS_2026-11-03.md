# Team prizes: status on 3 Nov 2026

Supersedes `TEAM_V2_STATE_2026-11-01.md` and the 1–2 Nov organizer plan. Team prizes are part of the usual prize setup and flow for every tournament. There is no separate "Team V2" path any more.

## How it works now (all tournaments)

1. **Setup → Team Prizes.** Group by School (team), Club, City, State, Gr or Type. Set team size, a girls minimum and an "other players" minimum. Under **Ranking & tie-breaks**, set the steps after Total Points: Highest individual scores, Best individual rank and Imported individual tie-breaks. The default is all three, in that order. There is no confirm tick.
2. **Import.** The Swiss-Manager Excel. TB columns (TB1, TB2 … or codes such as BH:GP/C1, DE, SB) are saved per player. DE is never compared, and blank values are never guessed.
3. **Review.** This shows the team results. If the steps cannot separate teams, those places stay empty, with the message "Tie for place N … choose the order on the Finalize page".
4. **Finalize.** This saves the version, and each decided place carries its `ranking_snapshot` ("Tie-break applied: …"). An open tie shows **Resolve Tie**. The usual dialog opens (with the runner-up included), the organizer orders the teams, and a reason is required. `resolve_team_tie` writes those places and the note at the same version.
5. **Publish.** This pins the version. The public `/p/<slug>/results` page shows the team winners, "Tie-break applied" and the tie note.

**Notes for organizers:**
- Reopening Finalize (Back, reload, a saved link) shows the saved version and keeps the tie choices (fixed 3 Nov, `f486d76`). Only going through Review → Finalize again creates a new version, which starts without the choices.
- The tie note is shown on the public page.

## What was removed (2 Nov, `81e20bf`)

- Removed from the app and the code:
  - The Admin → Team V2 page and its menu item.
  - The edge functions `saveTeamV2` and `prepareTeamRulingV2` (also deleted from Supabase).
  - The V2 ruling dialog and the `team_v2_save_required` fallbacks.
  - Eight `_shared/teamV2*`, tie-adjudication and finalize-guard helpers, with their tests.
  - The isolated atomic-writer CI and `qa/team-v2`.
  - The rollback script and the never-applied `20261027100000_finalize_atomic_version_candidate.sql`.
- Removed from the database: the write fence (`20261102050000`, step A), then the canary list, the separate writer, the fingerprint function and the six source-change triggers (`20261102090000`, step B).
- **Kept:** `institution_prize_groups.ranking_rules`, `team_allocations.ranking_snapshot` and `resolve_team_tie`.

Obsolete records: the Project files `team_v2_fresh_copy_tb_test.sql` and `team_v2_verify_tb_test.sql` referenced the canary list, which no longer exists. Do not run them.

## End-to-end test, 2–3 Nov 2026: PASSED

Run through the real screens on a new tournament, **TEAM TB E2E – synthetic test (do not publish)** (`718f71ef-bd99-415b-900a-a8458a2eb6d1`). It has 37 synthetic players, a synthetic Swiss-Manager Excel with the TB columns BH:GP/C1, DE and SB, and one deliberately blank TB1. It is now unpublished.

| Check | Result |
|---|---|
| Live code | `allocateInstitutionPrizes` deployed source byte-identical to `main`; site bundle has the new tie text and no Team V2 page |
| Setup | 3 individual categories, 3 team groups with three different step orders, all saved as set |
| Import | 37 players, TB values on all, one file hash, 3 columns, blank kept as blank |
| Best School (3, ≥1 girl, default steps) | 1 Green Valley by Total Points (the girl counted over a better-ranked boy) · 2 Hill View and 3 River Side by **Highest individual scores** · 4 Sunrise by **Best individual rank** · Pine Hill ineligible (no girl) |
| Best City (2, imported TBs only) | 2 Bhopal and 3 Cuttack by **Imported individual tie-breaks** · 4th **tied** (Durg and Erode equal on BH and SB; DE differs and was correctly skipped) |
| Best State (2, imported TBs then best rank) | Places 2–3 **held** (Goa board-1 TB1 blank); best rank was correctly not used |
| Finalize v1 | Team rows only for decided places, each with the right deciding step |
| Same players | Every team member's id, name, rank and points equal the player row; totals equal the member sum; individual winners from the same player list |
| Individual | Main 1–5 = ranks 1–5; Best Girl = the three best-ranked girls; Below 1500 = the two best-ranked players rated 1499 or less; one prize per player |
| Tie dialog | Both ties settled (Erode 4th; Bihar 2nd, Goa 3rd) with reasons; rows and notes at v1; no new version |
| Publish | Pinned v1; the public page matches Finalize; then unpublished |
| Regression | Team Prizes Guide Demo re-finalized as v3: same team winner and identical individual awards, now with the deciding step recorded |

Tests: 696 pass; the same 3 known failures (conflict-utils ×2, martech-metrics ×1).

## 3 Nov final checks: PASSED

- **Excel export** (Finalize → Export XLSX): real file captured; 4 sheets (Winners, Poster Grid, Arbiter Sheet, Team Prizes); the Team Prizes sheet matches the screen, including "Tie-break applied".
- **Print / PDF** (Finalize → Print, the app's PDF path): tie notices are marked print-hidden; the group label reads "Team".
- **Bug found and fixed (`f486d76`)**: reopening Finalize used to create a new version without the tie choices. Verified live: reload stays on the saved version (v2), ties resolved on v2 stay resolved after reload, and no new version appears.
- Trial tournament ends at v2 (11 team awards, 2 tie notes), unpublished. v2 is a leftover of the bug above.

## Screen look: Finalize and Final Prize (live 5 Nov 2026, `c9d653b`)

**Status: pushed to `main` and published; live check passed 5 Nov; owner checked the PDFs and Excel and closed it.** This replaces the earlier 3 Nov "Screen theme" attempt (`1c6e9ca`), which was superseded.

**Goal.** On screen, the four views (Category Cards, Poster Grid, Arbiter Sheet, Team Prizes) on `/t/:id/finalize` and `/t/:id/final/:view` look like the 28 Oct design in the permanently dark theme, with very light vertical column lines and centred columns (Team stays left). Print/PDF (the approved 30 Oct A4 designs), Excel, the public results page, Review/RCA and allocations are unchanged.

**How it is built.**
- Every CSS rule that used to apply in all media became print-only at the same position, so the print cascade is unchanged. Poster and Arbiter also keep a screen copy filtered with `:where(:not(.pm-print-surface *))`, so public pages look as before while organizer screens fall back to the 28 Oct Tailwind classes still in the markup.
- Category Cards: the 28 Oct `CategoryCardsView.tsx` is restored for screen (`print:hidden`); `CategoryCardsUpdatedView` stays the print design and is hidden on organizer screens by CSS. Public pages keep the updated view.
- New CSS: `CategoryCardsView.css`, `TeamPrizeResultsPanel.css` (screen only). Organizer-only screen blocks in the Poster, Arbiter and Team Prizes CSS add the column lines and centring.
- Guard test: `tests/utils/final-views-screen-print-split.spec.ts`. `qa/team-prizes/visual.spec.ts` waits for badge transitions (`settlePrint`) before its print-colour checks.
- Not touched: Excel code, engines, edge functions, public pages, Review, `index.css`, tailwind config.

**Proof (before push).** Print computed styles identical on 3,940 elements; 20 A4 PDF pages pixel-identical (dev, production build and clean checkout of the exact commit); print rule sequences identical; `qa/team-prizes` 6/6 with 7 pages identical; public screens identical. vitest 694 pass / 3 known failures; tsc 9 known errors; eslint 0 errors.

**Live check, 5 Nov 2026** (bundle `index-BV4vVG8m.js`, tournament `718f71ef-…`): Category Cards 26 texts, min 5.25:1; Poster Grid 59, min 5.70; Arbiter Sheet 78, min 4.98; Team Prizes 256, min 6.06. All: 0 below 4.5:1, 0 on light, 0 under 12px. Before: Team Prizes had 78 below 4.5:1 and 53 on light; Arbiter had 15 below. Finalize and `/p/:slug` were not scanned.

**Choice left open.** Team Prizes on Review and on the public results page do not get the column lines and centring (final-prize views only).

**Rules learned.**
1. A print-block diff alone is not proof; compare computed styles, real-print-path PDFs and rule sequences.
2. Never call `emulateMedia('screen')` before `page.pdf()`.
3. Keep the literal print at-rule text out of comments; use a comment-aware extractor.
4. shadcn badges have `transition-colors`; wait for animations after switching media.

**Backlog from this work.** Legacy `/t/:id/public` fallback contrast gaps (QR 2.71:1, Arbiter place numbers 2.18–2.59:1); dead first `--pm-team-fill` value; Team Prizes group heading can split at a page break; Excel has no page setup and omits held-tie rows in Team Prizes; `useMartechDrilldown.ts` assigns to a const. The route `/t/:id/final/:view` has no normal UI entry point (see cleanup).

## Small follow-ups (not blocking)

- **Removed 3 Nov:** the server function `generatePdf` (and `_shared/prizePrintableHtml.ts`, `_shared/teamPdfSnapshot.ts`). It failed for every tournament (`btoa` of the ₹ sign), and across the full git history (1,970 commits) no screen ever called it; no cron job or database function did either. The app's PDF is the browser print.
- On the saved and public views, "N eligible teams" counts the saved winners, not every eligible team. This is older behaviour.
- `backfillTeamAllocations` (Master repair for old published tournaments) still uses the old Rank Sum order to fill missing rows. Only relevant to tournaments published before team rows were saved.
- Deploys: a push to `main` does **not** deploy edge functions; the GitHub workflow fails on a function that no longer exists. Deploy with `supabase functions deploy <name> --project-ref nvjjifnzwrueutbirpde`, and publish the frontend with Lovable → Publish → Update.
