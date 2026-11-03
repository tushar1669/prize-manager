# Team prizes: status on 3 Nov 2026

Supersedes `TEAM_V2_STATE_2026-11-01.md` and the 1–2 Nov organizer plan. Team prizes are part of the usual prize setup and flow for every tournament. There is no separate "Team V2" path any more.

## How it works now (all tournaments)

1. **Setup → Team Prizes.** Group by School (team), Club, City, State, Gr or Type. Set team size, a girls minimum and an "other players" minimum. Under **Ranking & tie-breaks**, set the steps after Total Points: Highest individual scores, Best individual rank and Imported individual tie-breaks. The default is all three, in that order. There is no confirm tick.
2. **Import.** The Swiss-Manager Excel. TB columns (TB1, TB2 … or codes such as BH:GP/C1, DE, SB) are saved per player. DE is never compared, and blank values are never guessed.
3. **Review.** This shows the team results. If the steps cannot separate teams, those places stay empty, with the message "Tie for place N … choose the order on the Finalize page".
4. **Finalize.** This saves the version, and each decided place carries its `ranking_snapshot` ("Tie-break applied: …"). An open tie shows **Resolve Tie**. The usual dialog opens (with the runner-up included), the organizer orders the teams, and a reason is required. `resolve_team_tie` writes those places and the note at the same version.
5. **Publish.** This pins the version. The public `/p/<slug>/results` page shows the team winners, "Tie-break applied" and the tie note.

**Caution for organizers:**
- Resolve ties just before Publish. Reopening Finalize from scratch creates a new version without the choice.
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

## Small follow-ups (not blocking)

- "Grouped by: team" was shown in lower case on panels and the PDF. Fixed to "Team" (needs Lovable Publish and a `generatePdf` deploy).
- On the saved and public views, "N eligible teams" counts the saved winners, not every eligible team. This is older behaviour.
- `backfillTeamAllocations` (Master repair for old published tournaments) still uses the old Rank Sum order to fill missing rows. Only relevant to tournaments published before team rows were saved.
- Deploys: a push to `main` does **not** deploy edge functions; the GitHub workflow fails on a function that no longer exists. Deploy with `supabase functions deploy <name> --project-ref nvjjifnzwrueutbirpde`, and publish the frontend with Lovable → Publish → Update.
