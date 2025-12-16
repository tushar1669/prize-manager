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
- **Scoring:** Rank points = `(max_rank + 1 - player_rank)`. Team `total_points` is the sum of the best **team_size** players.
- **Gender slots:** `female_slots` require `gender === 'F'`; `male_slots` accept not-F (male, unknown/null). Remaining boards fill with best remaining players.
- **Tie-breaks:** Higher `total_points`, then lower `rank_sum`, then lower `best_individual_rank`, then institution name.
- **Ineligible tracking:** Counts + sample reasons recorded when a school cannot meet gender/team size.
- **Prize assignment:** Prizes sorted by place; prize N goes to ranked institution N (null if insufficient eligible teams). Only active prizes/rows are used.

## Outputs and callers
- **Conflict Review:** `useTeamPrizeResults` triggers allocation after preview completes; rendered via `TeamPrizeResultsPanel` alongside coverage/conflicts.
- **Finalize:** Always fetches team prize results when active groups exist and shows them in the results card.
- **PDF Export:** `generatePdf` checks for active groups, calls `allocateInstitutionPrizes`, and adds a Team / Institution Prizes section (with errors noted if allocation fails).

## Limitations / roadmap
- Only `by_top_k_score` (rank points sum) is available; additional scoring modes are deferred to Phase 2.2.
- Team prizes do not currently annotate public pages beyond Conflict Review/Finalize/PDF.

## Common setup pitfalls
- Ensure gender slots do not exceed team size (blocked in Rules sheet, enforced by DB check).
- Leave empty institution values clean in player data; blank keys are skipped and reduce eligible count.
- Save prize tables after edits; unsaved changes banner indicates pending draft rows.
