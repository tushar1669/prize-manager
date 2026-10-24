# Girl markers in Type / Group overriding Gender = M — check report

## Is the statement correct?
Mostly yes, with one wording correction.

- `src/utils/genderInference.ts:83-85, 168-192` (browser import) and `supabase/functions/parseWorkbook/index.ts:230-232, 311-325, 590-617` (server import) use the same rules.
- Each Type / Group label is split into words. A word makes the player female if it:
  - matches `F` + 1–2 digits exactly (F9, F09, F13) — "F" + digits inside a longer word does not count;
  - contains `FMG` anywhere in the word (so "XFMGY" also counts);
  - is exactly `GIRL` or `GIRLS` — the statement's "containing GIRL" is wrong: "GIRLSU13" or "GIRLY" would not count.
- If the Gender column says M, the girl marker still wins: the player is saved as F with the note "female signal overrides explicit male gender" (`genderInference.ts:245-247` and the matching lines further on). This is intended behaviour, also written in `docs/gender-detection.md:61`.

## Has it happened in our data? (read-only check, signed in as admin)
- **712 players in 16 tournaments** have a girl marker in Type or Group. All 712 are saved as F. No M or blank player has one.
- **0 players** carry the "overrides explicit male gender" note. So no one marked M in the file has been switched to girl by a Type/Group label.
- Limit: we only keep the final gender, not the original file, so this rests on the saved note. Import history only started recently.

## Risk (why this could still go wrong)
1. **Silent switch:** the note is saved on the player but never shown on the import screen. A boy marked M with a mistyped Type (for example F13 instead of U13) would quietly lose boys' prizes and could win girls' prizes.
2. **"Contains FMG" is too loose:** any word containing FMG counts, not just the word FMG.
3. **The rule that wins is the weaker one:** the Gender column is the organizer's direct statement, but a group code overrules it.

## Proposed fix (needs your OK; import only; prize rules not touched)
Step 1 — Make it visible (lowest risk):
- On the import screen, when a girl marker overrides M, show: "N players are marked M in the Gender column but have a girl group (F13/FMG/GIRL). They were saved as girls — please check." with the list of names. No change to results.

Step 2 — Change the rule (your decision):
- Option A (recommended): if the Gender column clearly says M, keep M, and show the conflict for the organizer to fix in the file. Girl markers still fill in gender when the Gender column is blank.
- Option B: keep "girl marker wins", with only Step 1's warning.
- Same change in both the browser and server import so they agree. Update tests (`tests/gender-logic.spec.ts`) and `docs/gender-detection.md`.

Step 3 — Tighten FMG: count only the exact word FMG (or FMG + digits), not FMG inside other words.

Today's data would not change under any option, because no player has this conflict.

## Not touched
Allocation engine, saved players, database, permissions, publishing.
