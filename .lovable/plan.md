# Youngest Overall + Oldest Overall — grouped "Special Category" UI

## Recommended UI: 3 tabs + one "Who qualifies?" dropdown

Not seven separate buttons. The Category Rules drawer shows three choices:

```text
Special Category
[ Standard ]  [ Youngest ]  [ Oldest ]

(only when Youngest or Oldest is picked)
Who qualifies?   [ Everyone (Overall)   v ]
                   Everyone (Overall)   <- default
                   Girls only
                   Boys / not marked as girl
```

Why this is better: it's shorter, it stays readable on small screens, and the organizer makes one decision at a time (what kind of prize, then who can win it).

### Behaviour
- Picking **Youngest** or **Oldest** sets "Who qualifies?" to **Everyone (Overall)**.
- The Gender, Age and Rating fields are greyed out, as they are for today's Youngest/Oldest options. The dropdown controls gender.
- Help text under the dropdown changes with the choice:
  - Everyone: "Every player with a date of birth can win, boys and girls alike."
  - Girls only: "Only players marked F."
  - Boys / not marked: "Players not marked F, including players with no gender recorded."
- The existing switch "Award true youngest/oldest even if already won another prize" stays as it is, and stays off by default.
- Existing categories open correctly. For example, a saved Youngest Girl opens as Youngest + Girls only. Nothing needs converting.

### Badges on category cards
Youngest Overall, Youngest Girl, Youngest Boy, Oldest Overall, Oldest Woman and Oldest Man. The existing "Duplicate winner allowed" badge is kept.

## How the prize is decided
- **Overall:** any player with a date of birth can win, whatever their gender (F, M or blank).
- Youngest uses the latest birth date. Oldest uses the earliest birth date.
- Ties are broken as today: better rank, then higher rating, then name.
- Players with no date of birth can't win (same as today).
- The Girls and Boys versions work exactly as they do today.

## Steps (each step: build, test, verify, then wait for your OK)
1. **Engine:** recognise the two new values, `youngest_overall` and `oldest_overall`, with no gender filter. Add unit tests:
   - a girl who is the youngest wins Youngest Overall
   - a player with blank gender can win
   - a player with no date of birth is excluded
   - tie-breaks work for Oldest Overall
   - the existing youngest/oldest tests still pass
   
   This step changes the prize-allocation engine, which needs your explicit approval. Saying yes to this plan gives that approval for this one change only.
2. **Setup drawer:** the three tabs and the dropdown described above. Gender is set from the dropdown: Overall leaves gender open, Girls sets F, Boys sets M_OR_UNKNOWN. Saved categories open on the right tab and dropdown choice.
3. **Badges and labels:** category cards, and the reason labels on the Review page and in the exports.
4. **Docs:** update RULES_AND_SETTINGS_REFERENCE.md, ALGORITHM_RULES.md and the organizer guide.

## Technical details
- Values stay in `criteria_json.category_type`. There are no database changes and no migration.
- Engine (`supabase/functions/allocatePrizes/index.ts`):
  - `isYoungestCategory` and `isOldestCategory` (around line 1940) also accept the `_overall` values.
  - The forced gender (around line 1528) returns null, meaning no filter, for `_overall`.
  - Lines 1517–1518 also include the `_overall` values.
  - Redeploy `allocatePrizes`.
- UI (`src/pages/TournamentSetup.tsx`):
  - The options list (around line 2426) is replaced by three tabs plus a shadcn Select. The pair (kind, audience) maps to `category_type`.
  - The DOB-special checks (around lines 2474 and 2833) and the forced gender (around line 2938, and the effect around line 480) are extended.
- `src/components/prizes/CategoryCriteriaChips.tsx`: add the Overall labels.
- Tests: add cases to `tests/allocation/youngest.spec.ts` and `oldest.spec.ts`, then run `npm run test:unit`.
- Out of scope: team prizes, the database, permissions, publishing, and the rest of the engine.
