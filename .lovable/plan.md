# Team Prizes — Read-only UX Audit (no code changed)

## 1. Inventory of surfaces

| # | Surface | File | Current user-visible strings |
|---|---------|------|------------------------------|
| 1 | Setup → Team Prizes tab (config) | `src/pages/TournamentSetup.tsx:1872,1883,1889` | Tab: "Team Prizes"; helper: "…**Team Prizes** to add them manually." |
| 2 | Team prizes editor (list + info banner) | `src/components/team-prizes/TeamPrizesEditor.tsx:140-250` | "Configure team prizes (Best School, Best Academy, Best City Team, etc.)"; "How team prizes work:" • "Teams are formed by grouping players by a shared field (school, club, city, state, etc.)" • "Each team's score is the sum of top-K players' scores" • "Gender requirements ensure mixed teams if needed" • "Players can win both individual AND team prizes (team prizes ignore multi_prize_policy)"; badges `Top {team_size}`, `F{n}/M{n}`; "No team prize groups configured yet."; "Add Team Prize Group" |
| 3 | Rules sheet (the config form) | `src/components/team-prizes/TeamPrizeRulesSheet.tsx` | "Configure how teams are formed and scored."; "Group Name"; "Group Players By"; "Team Size" + "Number of players counted per team for scoring."; "Gender Requirements" / "Optional"; "Female Slots"; "Male Slots"; examples: "team_size=4, female_slots=2, male_slots=2 → exactly 2 girls + 2 boys", "team_size=5, female_slots=2, male_slots=0 → at least 2 girls, rest can be any gender", "team_size=4, female_slots=0, male_slots=0 → no gender requirements", "If slots sum to less than team_size, remaining boards are filled by best remaining players of any gender."; "Scoring Mode" (disabled) + "Sum of Top-K Scores"; "More scoring modes can be added later (Phase 2.2)."; validation "Gender slots (x + y = z) cannot exceed team size (n)" |
| 4 | Prize rows per group | `src/components/team-prizes/TeamGroupPrizesTable.tsx` | "Add Prize", "Unsaved changes" |
| 5 | Results panel (shared by review, finalize, public) | `src/components/allocation/TeamPrizeResultsPanel.tsx:85-190` | Badges: "Top {n} players", "{f}F + {m}M required", "{n} eligible team(s)", "{n} winner(s) • ₹…"; table headers Place / Team / Points / Rank Sum / Best Rank / Prize; empty state "No eligible teams found" + "Common causes:" • "**Missing \"{field}\" data** – players may not have this field populated in the import" • "**Gender requirements impossible** – not enough female (f) or male (m) players per team" • "**Team size too large** – teams need at least {n} players to qualify"; "{n} unfilled prize(s)" + "Not enough eligible teams to fill all places." |
| 6 | Conflict Review | `src/pages/ConflictReview.tsx:31` (via `useTeamPrizeResults` → panel 5) | inherits panel strings |
| 7 | Finalize → Team Prizes tab | `src/pages/Finalize.tsx:672,686` → `src/components/final-prize/TeamPrizesTabView.tsx` | "Team Prizes"; "No Team Prizes Configured"; "This tournament does not have any team prize groups set up."; "Checking for team prizes…"; "Loading team prize results…"; "Failed to load team prize results: …" |
| 8 | Final Prize View (print path) | `src/pages/FinalPrizeView.tsx:23,124` | tab "Team Prizes" → same panel with `print:` classes |
| 9 | Public results page | `src/pages/PublicResults.tsx:209-211` → `src/components/public/PublicTeamPrizesSection.tsx` | "Team Prizes"; "Loading team prizes…"; reuses panel 5 verbatim (so public visitors see the same "{f}F + {m}M required" claim) |
| 10 | PDF export | `supabase/functions/generatePdf/index.ts:398-420` | "Team / Institution Prizes"; "Team prizes are allocated separately from individual prizes. Players may win both individual and team prizes."; per group "{field} • Teams of {n} ({f}F + {m}M required) • {n} eligible institution(s)"; fallback "Please check the online Team Prizes view." |
| 11 | Tie-break dialog | `src/components/allocation/TeamTieBreakDialog.tsx` | tie resolution copy (unaffected by a–d) |
| 12 | Engine + public API | `supabase/functions/allocateInstitutionPrizes/index.ts` (header comment line 27 "team of 4 must include 2 girls + 2 boys"; `ineligible_institutions`, `ineligible_reasons` at 120-121, currently always 0/empty), `supabase/functions/_shared/teamPrizes.ts` (no gender logic), `supabase/functions/publicTeamPrizes/index.ts:180-182` (echoes slots) | strings are echoed into surfaces 5, 9, 10 |

Confirmed by reading: slots are stored, echoed and rendered, but `computeTeamScores` never reads gender — every "required" badge today is an unbacked claim.

## 2. Replacement copy for TeamPrizeRulesSheet

- Section title: "Team make-up (optional)" — replaces "Gender Requirements".
- Female slots label: "Girls on the team (minimum)"; helper: "Counts only players recorded as female in the player list."
- Male slots label: "Other players (minimum)"; helper: "Counts every player not recorded as female — including players whose sex was not recorded."
- Replace the three examples with:
  - "Team of 4, 2 girls minimum → the two best girls plus the two best remaining players."
  - "Team of 4, 2 girls and 2 others → the rule can only be met if at least two players are recorded as female."
  - "Team of 4, no minimums → the four best players, whatever their record shows."
  - Closing line: "We can only count girls when the player list records them as female. If your file has no sex column, girls-minimum rules will not be met."
- Team size helper: "How many players make up a team for scoring."
- Roster policy control (new, item d) label: "Roster requirement" with options "Full team only", "Allow one player short", "Allow any team with at least one player".
  - "i" hover text: "How many players a school must have before it can win. Full team only means a school needs the full team size. Allow one short means one place may be empty and the team scores on the players it has. Allow any means even a single player counts. This applies to every team prize group in this tournament, measured against each group's own team size."

## 3. Where reason codes surface (b)

- Engine: populate `ineligible_reasons` per institution (e.g. `roster_short`, `girls_minimum_not_met`, `missing_group_field`, `outranked`, `tie_lost_on_rank_sum`) instead of the current empty array.
- Organizer view: in the results panel (surface 5), add a collapsible "Schools that did not win" table under the winners table — columns School / Players counted / Points / Why no prize, with a plain-English sentence per row ("Only 3 players — this tournament requires a full team of 4", "Outranked — finished 5th, 3 prizes available"). Default collapsed, shown in Conflict Review and Finalize only.
- Also surface a one-line summary badge: "{n} schools did not qualify" next to "{n} eligible teams".
- Add a team sheet to the existing RCA export (`src/utils/allocationRcaExport.ts` pattern) so an organizer can send a school its exact row.
- Master view: same table, plus raw codes, group config snapshot and counts per code, in the admin/team-snapshots surface (`src/pages/admin/AdminTeamSnapshots.tsx`).
- Not on public pages and not in the PDF — a public list of losing schools with reasons is a reputational risk.

## 4. Honest display strings (c)

| Surface | Before | After |
|---------|--------|-------|
| Results panel badge (`TeamPrizeResultsPanel.tsx:86-92`) | "2F + 2M required" | "Rule: at least 2 girls" (and, when male_slots>0, "Rule: at least 2 girls, 2 other players") |
| Results panel empty state | "Gender requirements impossible – not enough female (2) or male (2) players per team" | "The girls minimum could not be met – fewer than 2 players per school are recorded as female" |
| Results panel empty state | "Team size too large – teams need at least 4 players to qualify" | "Not enough players – this tournament requires {policy wording} for a team of 4" |
| Editor badge (`TeamPrizesEditor.tsx:245-247`) | "F2/M2" | "min 2 girls" |
| Editor info banner | "Gender requirements ensure mixed teams if needed" | "You can require a minimum number of girls in a team. This only works when the player list records sex." |
| PDF group meta (`generatePdf/index.ts:410-418`) | "Teams of 4 (2F + 2M required)" | "Teams of 4 • rule applied: at least 2 girls" |
| Public page | inherits the badge above | same "Rule: …" wording; never print per-player sex or composition counts |
| Winner row | (players listed with rank only — already safe) | unchanged |

Principle: state the rule that was applied, never assert what the winning team is made of.

## 5. Where the roster policy lives (d)

- Belongs in Setup → Team Prizes tab, as a single card above the group list in `TeamPrizesEditor.tsx`, titled "Roster requirement (all team prizes)", stored on the tournament (tournament-level setting) and applied per group against that group's `team_size`.
- Alternative rejected: Settings page — organizers configure everything team-related in this tab, and a hidden global would be missed.
- Surprise risks to mitigate:
  - The card sits directly above per-group cards that each have their own Team Size, so it can read as per-group. Mitigation: the "all team prizes" suffix in the title plus an explicit line inside each group card — "Roster requirement: allow one short (applies to all groups) — this group needs 3 of 4".
  - Changing it silently changes who qualifies in every group. Mitigation: on change, show "This changes eligibility for all {n} team prize groups. Re-run allocation to see the effect."
  - "Allow one short" interacts with scoring: a short team scores on fewer players and will almost always lose. Say so: "Short teams are scored on the players they have, so they usually rank below full teams."

## 6. Honesty / clarity flags for a non-technical organizer

- "Male slots satisfied by not-F" is the single biggest trap: a school with four boys none of whom have a recorded sex still fills a "2 boys" rule, while a school with two real girls unrecorded fails a "2 girls" rule. Never label that control "boys" — use "other players" and say unrecorded players count there.
- The current copy in the rules sheet ("exactly 2 girls + 2 boys") is untrue today in two ways — the engine ignores slots entirely, and even after (a) it is a minimum, not "exactly".
- The engine header comment claiming "2 girls + 2 boys" support should be corrected in the same cycle so future readers don't re-assert it.
- Existing tournaments already published with an "F + M required" badge will change wording after the fix; if any are live, note the change rather than rewriting history silently.
- Reason codes must be sentences, not codes, in the organizer view — `roster_short` means nothing to a school secretary.
- "Top-K score" and "multi_prize_policy" in the info banner are internal terms; replace with "the best N players" and "a player can win both an individual prize and a team prize".
- Do not show public visitors a "did not qualify" list.
