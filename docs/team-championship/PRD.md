# Team Championship — PRD

**Status:** TC1.1 · documentation only · 6 September 2026
**Owner:** Tushar Saraswat
**Scope boundary:** DD1 (PROJECT_STATE §3). This is the **team engine's own** product document.
It never edits, and never speaks for, `supabase/functions/allocatePrizes`, `rule_config`, conflicts,
player-to-prize matching, the `allocations` table, or the allocation engine's docs.

---

## 1. What Team Championship is

A tournament awards prizes to **institutions** — Best School, Best Academy, Best Club, Best State —
by scoring each institution from its top *N* players in the same event that awards individual prizes.
A player may win both an individual prize and a team prize; the two engines never consult each other.

Today the platform stores a team composition rule, prints it on results and PDFs, and **does not apply
it**. TC1 closes that gap. TC2 and TC3 build on the closed gap.

## 2. The problem TC1 fixes

`institution_prize_groups` carries `female_slots` and `male_slots`. Those numbers are:

- stored (`src/integrations/supabase/types.ts:716-740`),
- echoed in the compute response (`supabase/functions/allocateInstitutionPrizes/index.ts:390`),
- echoed in the public response (`supabase/functions/publicTeamPrizes/index.ts:181`),
- badged in the editor as `F2/M2` (`src/components/team-prizes/TeamPrizesEditor.tsx:243-247`),
- badged on results as `2F + 2M required` (`src/components/allocation/TeamPrizeResultsPanel.tsx:86-92`),
- printed onto the tournament PDF as `(2F + 2M required)` (`supabase/functions/generatePdf/index.ts:408-413`),
- described in writing to the organizer, with worked examples
  (`src/components/team-prizes/TeamPrizeRulesSheet.tsx:193-195`),

and **never read by the selector**. `computeTeamScores` in `supabase/functions/_shared/teamPrizes.ts:32-70`
takes `(players, teamSize, groupBy)` and has no gender parameter of any kind.

This is **DD5**. Exposure today is nil — all three live groups sit at `female_slots = 0, male_slots = 0`
(PROJECT_STATE §2 live census, 6 Sep) — and becomes a false public statement the moment an organizer
sets a slot and publishes. That is the TC1 trigger.

## 3. Decided rulings

These are **recorded as decided**. They are not re-argued here or in `ARCHITECTURE.md`.

### RULING 1 — Gender semantics

- `female_slots` is satisfied **only by an explicit `'F'`** on `players.gender`.
- `male_slots` is satisfied by **"not F"**, which **includes players whose `gender` is `NULL`**.

This mirrors two existing authorities:

1. `allocatePrizes`' `M_OR_UNKNOWN` rule (`supabase/functions/allocatePrizes/index.ts:1523-1556`):
   *"Unified logic: 'M' and 'M_OR_UNKNOWN' both mean 'not F' (boys + unknown)"* — boys mode excludes
   explicit `F` and admits unknown; girls mode requires an explicit `F` and fails `gender_missing`
   on a blank.
2. Swiss-Manager's documented Sex field (manual p.23: *"W..woman, C..Computer or blank..man"*).
   A blank Sex column is not missing data in a Swiss-Manager export; it is the default for a male entrant.

**This is a deliberate PARALLEL implementation, not a shared import.** DD1 forbids editing
`allocatePrizes` to extract a helper. The team engine writes its own predicate in
`_shared/teamPrizes.ts` and accepts the duplication as the cost of the boundary.

**Consequence for the UI, binding:** because `male_slots` means *"not F"*, the control must **NOT** be
labelled "Male Slots". It is **"other players (minimum)"**. The current label at
`src/components/team-prizes/TeamPrizeRulesSheet.tsx:174` is wrong and is corrected in TC1.5.

### RULING 2 — Printed output

Output states **the rule that was applied**. It never asserts a count of players' attributes.

| Permitted | Not permitted |
|---|---|
| `Rule: at least 2 girls` | `2F + 2M required` |
| `Rule: at least 2 girls, 2 other players` | `Team: 2F + 2M` |

The engine knows what it required. It does not know, and must not claim, what any individual on a
roster is. Every site listed in §2 that prints `2F + 2M` is in scope for TC1.5.

### RULING 3 — Roster minimum · **DECIDED 7 September 2026**

**Decision:** `minimum_roster_size` is a **per-prize-group** field on `institution_prize_groups`,
separate from `team_size`, defaulting to `team_size`. The tournament-level
**allow-incomplete-teams flag is WITHDRAWN**. One setting, not two.

- `minimum_roster_size` — how many entrants an institution must have **entered** to compete for the prize.
- `team_size` — how many of them are **counted** toward the score.

**Reason for the withdrawal:** a per-group minimum expresses everything the flag did, and also
expresses real regulations the flag cannot. Setting `minimum_roster_size` equal to `team_size`
is the flag switched off; setting it below `team_size` is the flag switched on — but only where
the organizer wants it, and at whatever threshold the regulation actually names. Two controls
that overlap on part of their range and disagree on the rest is a configuration the organizer
would have to reason about; one control is not.

**Evidence:**

1. Published regulations routinely set a minimum number of entries independently of the number of
   players counted.
2. **Mary Cherian Memorial 2026** sets **Best School at 5 entries / best 4** and **Best Academy at
   8 entries / best 4** — two different minimums, same counted size, **in the same tournament**.
   A tournament-level field cannot express this. A per-group field can.

## 4. Organizer-facing behaviour after TC1

| Setting | Level | Meaning |
|---|---|---|
| Group players by | per group | `club` / `team` / `city` / `state` / `group_label` / `type_label` |
| Team size | per group | how many players are counted |
| Girls (minimum) | per group | satisfied only by an explicit `F` |
| Other players (minimum) | per group | satisfied by anyone not marked `F`, including unmarked |
| Minimum roster size | per group | how many entrants an institution must have entered to compete — defaults to team size (RULING 3) |
| Allow incomplete teams | — | **WITHDRAWN by RULING 3.** Subsumed by minimum roster size; no tournament-level flag ships |

Every setting must show the organizer, before allocation runs, what it will do — and after allocation
runs, why any institution was left out. Silent exclusion is the defect TC1 exists to end
(`_shared/teamPrizes.ts:58`).

## 5. Reason codes are a product requirement, not a debug channel

Every institution the engine drops must carry a code, and **every code must render as a plain sentence
in organizer-facing UI — never as a raw code**. `team_short_roster` never reaches a human eye; *"Fewer
players than the team size"* does. The vocabulary and the mapping live in `ARCHITECTURE.md` §4.

## 6. What TC1 does **not** cover

- **TC2 — Mode A (automatic).** Organizer uploads the Swiss-Manager file, defines composition, the
  system picks each institution's team and ranks the teams. Largely exists once TC1 lands.
- **TC3 — Mode B (manual).** Organizer hand-picks each institution's team from a dropdown of eligible
  players. Needs new schema, a per-school UI, and a writer.
- **Brochure team-prize extraction is a SEPARATE, LATER WORKSTREAM and is not part of TC1.**
  The extraction engine (`docs/extraction-engine/`, `/extract`, `/commit-extraction`) commits
  tournaments, categories and prizes only. It does not create `institution_prize_groups` today and
  TC1 does not make it do so. Reading team prizes out of a brochure is scheduled after TC3 and is
  documented in the extraction engine's own docs when it starts — not here, and not by editing this
  document into it.
