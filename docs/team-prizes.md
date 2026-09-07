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
- **Gender slots:** `female_slots` / `male_slots` **are enforced in team selection as of TC1.4b** — `allocateInstitutionPrizes` passes the group's configured values into `computeTeamScoresWithReasons` as `slots`. Under **RULING 1** a female slot is satisfied only by an explicit `'F'`, and a male slot is satisfied by anyone **not** recorded as `'F'` — including players whose gender was never recorded, because a blank Sex column in a Swiss-Manager export is the default for a male entrant, not missing data. Both are **minimums, not exact quotas**: once each minimum is met, every remaining board goes to the best-ranked players still unselected, of any gender. An institution that cannot meet a minimum is excluded with `female_slots_unfilled` or `male_slots_unfilled`. **Display caught up in TC1.5.** The editor badge (`TeamPrizesEditor.tsx`), the results panel (`TeamPrizeResultsPanel.tsx`) and the PDF (`generatePdf/index.ts`) no longer print `2F + 2M required`; each now states **the rule that was applied** — `min 2 girls`, `Rule: at least 2 girls`, `(rule applied: at least 2 girls)` — as **RULING 2** requires, and the "Male Slots" control is now labelled **"Other players (minimum)"** per RULING 1. The **ineligible-institution list is organizer-only**: it renders on Conflict Review and Finalize, and never on the public results page, never on the printed `FinalPrizeView`, and never in the PDF. One formatter, `formatTeamRuleClause`, produces all three; `generatePdf` carries a deliberate parallel copy because a Deno edge function and the browser bundle share no module. At `female_slots = 0, male_slots = 0` — where all three live groups sit — it returns null and **no rule text is rendered at all**, not "0 girls" and not an empty badge. Rulings are recorded in `docs/team-championship/PRD.md`.
- **Tie-breaks:** The team ranking cascade in `compareInstitutions` (`_shared/teamPrizes.ts:25-30`) is: `total_points` descending, then `rank_sum` ascending, then `best_individual_rank` ascending, then institution `key` (locale compare).
- **Ineligible tracking:** **Reasons ship in the compute/preview response as of TC1.4b, and render in the organizer panel as of TC1.5.** `allocateInstitutionPrizes` returns the real `excluded` set from `computeTeamScoresWithReasons`: `ineligible_institutions` is the full count, `ineligible_reasons` is a capped-at-10 `string[]` ordered by roster size descending (kept for backward compatibility), and `ineligible_details` is the same information **uncapped and structured** as `{ key, reason, playerCount }`. `TeamPrizeResultsPanel` renders from `ineligible_details`, so every excluded institution is listed rather than five of them, each code mapped to its plain sentence from `ARCHITECTURE.md` §4 — never a raw code. The section is **gated behind the panel's `showDiagnostics` prop, which defaults to false**, and `TeamPrizesTabView` carries its own prop with the same false default so the gate is per-SURFACE, not per-component: only `ConflictReview.tsx` and `Finalize.tsx` pass it true. `FinalPrizeView.tsx` — the print and handout artifact — inherits false, as does `PublicTeamPrizesSection`, and `generatePdf` never printed the list at all. A list of the schools that did not qualify never reaches the public page or a printed page. The `:319-320` invalid-`group_by` early exit correctly keeps its `0` — nothing has been scored on that branch. **The public and persisted paths still return empty**: `publicTeamPrizes/index.ts:212-213` and `useTeamPrizeResults.ts:165-166` hardcode `ineligible_institutions: 0` because there is still nothing persisted for them to read. Persistence lands in TC1.6, and the panel renders nothing at all where the fields are absent.
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
