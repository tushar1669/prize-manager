# Team / Institution Prizes (Phase 2 Overview)

## Data model
- **Tables:**
  - `institution_prize_groups`: defines grouping column, team size, gender slots, scoring mode, and active flag per tournament. Gender slots must not exceed team_size; defaults to `by_top_k_score` scoring.
  - `institution_prizes`: per-group prize rows (place, cash_amount, has_trophy, has_medal, is_active) cascading on group delete.
- **RLS:** Both tables mirror the category/prize policies; orgs or master role can CRUD within their tournament, anon can only read published tournaments.
- **Indexes:** tournament_id on groups, group_id on prizes for allocation calls.

## UI configuration walkthrough
1. Open **Tournament Setup → Team / Institution Prizes**.
2. **Add Team Prize Group** (Rules sheet):
   - **Group Name**: label shown in outputs.
   - **Group Players By**: `club`, `city`, `state`, `group_label`, or `type_label` (maps to players table columns).
   - **Team Size**: number of players counted per team.
   - **Gender Requirements** (optional): set female_slots and/or male_slots; validation blocks totals above team_size.
   - **Scoring Mode**: fixed to `by_top_k_score` (future modes gated for Phase 2.2).
3. Expand the group → **Add Prize** rows (place, cash, trophy, medal, active). Save applies inserts/updates/deletes via `useSaveInstitutionPrizes` with RLS-safe mutations.
4. Unsaved draft rows are highlighted; hydration is gated to avoid clobbering local edits while saving.

## Allocation behavior (allocateInstitutionPrizes edge function)
- **Isolation:** Separate from `allocatePrizes`. multi_prize_policy is ignored; players can win both individual and team awards.
- **Grouping:** Active groups only; players missing the grouping column are skipped. Empty/null institution keys are excluded.
- **Scoring:** Team `total_points` is the sum of the raw `players.points` column for the best **team_size** players. The team is selected by tournament `rank` ascending, ties broken by player `id` (`_shared/teamPrizes.ts:51-58`); institutions with fewer than `team_size` players are dropped. There are no rank points: `max_rank` is computed in `allocateInstitutionPrizes/index.ts:286` only to populate `max_rank` in the response (`:405`) and never reaches the scorer.
- **Gender slots:** `female_slots` / `male_slots` are stored on the group and displayed in the UI, but they are **not enforced in team selection today**. `computeTeamScores(players, teamSize, groupBy)` reads no gender field, so the top `team_size` players by rank are taken regardless of gender. TC1.4 implements enforcement under the rulings recorded in `docs/team-championship/PRD.md`.
- **Tie-breaks:** The team ranking cascade in `compareInstitutions` (`_shared/teamPrizes.ts:25-30`) is: `total_points` descending, then `rank_sum` ascending, then `best_individual_rank` ascending, then institution `key` (locale compare).
- **Ineligible tracking:** **Not implemented today.** `ineligibleCount` and `ineligibleReasons` are declared as the literals `0` and `[]` at `allocateInstitutionPrizes/index.ts:340-341` and are never reassigned, so the response at `:396-397` always reports zero ineligible institutions and no reasons on the normal path. The only site that ever emits a reason is the invalid-`group_by` early exit at `:319-320`. Two read paths hardcode the same empty values: `publicTeamPrizes/index.ts:212-213` and `useTeamPrizeResults.ts:165-166`. Because `TeamPrizeResultsPanel.tsx:248` renders the ineligible section only when the count **and** the reasons array are both non-empty, that UI has never rendered in production. TC1.3 implements it.
- **Prize assignment:** Prizes sorted by place; prize N goes to ranked institution N (null if insufficient eligible teams). Only active prizes/rows are used.

## Outputs and callers
- **Conflict Review:** `useTeamPrizeResults` triggers allocation after preview completes; rendered via `TeamPrizeResultsPanel` alongside coverage/conflicts.
- **Finalize:** Always fetches team prize results when active groups exist and shows them in the results card.
- **PDF Export:** `generatePdf` checks for active groups, calls `allocateInstitutionPrizes`, and adds a Team / Institution Prizes section (with errors noted if allocation fails).

## Limitations / roadmap
- Only `by_top_k_score` is available (sum of the raw `players.points` column over the best **team_size** players by rank, not a rank-points sum); additional scoring modes are deferred to Phase 2.2.
- Team prizes do not currently annotate public pages beyond Conflict Review/Finalize/PDF.

## Common setup pitfalls
- Ensure gender slots do not exceed team size (blocked in Rules sheet, enforced by DB check).
- Leave empty institution values clean in player data; blank keys are skipped and reduce eligible count.
- Save prize tables after edits; unsaved changes banner indicates pending draft rows.
