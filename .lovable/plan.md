# Check report: girl markers in Type/Gr and the "PC" marker in Gr

Nothing was changed. This is a read-only check of the code and the live data.

## 1. "F9 / F09 / F13, FMG or GIRL in Type makes the player a girl, even if Gender says M"

**Mostly true, with a few details to tighten.**

- Type and Gr labels are split into words at spaces, commas, `;`, `|` and `/`. Each word is then checked (`src/utils/genderInference.ts:99-113, 167-193`; the server import has the same rules at `parseWorkbook/index.ts:230-324`).
  - `F` followed by 1–2 digits, as the whole word: F9, F09, F13 count. F100, "F13A" and "U13F" don't count.
  - `FMG` anywhere inside a word. This is a substring check, so a label like "XFMGY" would also count.
  - `GIRL` or `GIRLS` as a whole word. "GIRLSU13" doesn't count.
- The same rules apply to **Gr**, not just Type.
- **Female overrides M:** yes. The steps run in order: Gender column, then fs, then the untitled column, then Type, then Gr. Any female signal sets the player to F, and a warning "female signal overrides explicit male gender" is attached (lines 241-293).
- **Limitations**
  1. The override never asks the organizer. If Swiss-Manager has a wrong Type (for example a boy entered in an F13 group), he becomes a girl without any prompt. The warning is saved with the player but isn't shown clearly at import.
  2. The FMG substring rule is wider than the documents say.
  3. A label like "F-13" or "F 13" doesn't match. "F 13" splits into "F" and "13", and a lone "F" is not a Type marker.
- **In your data:** 702 players have an F-number Type (F07–F20, F8, F9). All 702 are stored as F. 37 players with Gr = "FMG" (1 tournament) are all F. **No override warning has ever been recorded**, so the case "Gender column says M but Type says girl" has not happened in production.

## 2. "Any Gr containing 'PC' anywhere marks the player as PC (physically challenged)"

**Not true as stated.** The code disagrees with itself:

- `normalizeGrColumn` (`src/utils/valueNormalizers.ts:175`) uses "contains PC".
- But the saving step (`src/utils/playerImportPayload.ts:106-108`) checks again and accepts only a Gr that is exactly `PC` (any letter case). The import screen always fills in the group label first (`PlayerImport.tsx:2157-2173`), so this exact-match check is the one that decides. In practice, **only a Gr of exactly "PC" marks a player as PC.**
- **Limitations**
  1. "U12 PC" or "PC, U15" in Gr is **not** marked as PC, even though the code comment and help text suggest it would be.
  2. If the "contains" rule ever took over, it would wrongly match labels like "NPC", "PCMC", "UPCOMING".
  3. **A Type of "PC" is never read as disability.** It is kept only as a Type label.
  4. The disability field is filled only from Gr = PC or from a Disability column.
- **In your data:**
  - Gr = "PC": 74 players in 12 tournaments, all marked PC. No partial labels like "U12 PC" exist in Gr.
  - Type = "PC": 28 players in about 6 tournaments. None are marked PC; 3 have "PWD" from a Disability column. One player has Type "U12 PC".
  - **No category uses the Disability rule (0).** PC prizes are set up by Type (6 categories) or Gr (8 categories) instead. Those check the label directly, so **no organizer has lost a PC prize because of this**. The risk is only for future setups that use the Disability rule.

## Root cause (short)

- Two versions of the PC rule ("contains" and "exact") live in two files. The exact one wins without anyone noticing.
- The girl-marker rules are wider than the documents describe, especially FMG.
- When a girl marker overrides M, nothing is shown to the organizer.

## Proposed fix (each step on its own: build, test, then wait for your OK)

1. **One PC rule, by whole word.** Treat Gr **or** Type as PC when one of its words is exactly `PC`. This covers "PC", "U12 PC" and "PC/U15", but not "NPC" or "PCMC". Use it in both files and in the server import. Add tests. This changes nothing for the 74 players who are already PC.
2. **Tighten FMG to a whole word,** matching F13 and GIRL. Tests. None of the current data changes, because all stored values are exactly "FMG".
3. **Show the override at import.** Show a notice like "N players were marked female from their Type/Group even though Gender said M", with a list to check. This changes display only.
4. **Update the docs** (`docs/gender-detection.md`, `docs/group-label-feature.md`, `docs/type-label-feature.md`, the Excel ReadMe text) so they describe the exact rules.

Not touched: the prize allocation engine, database rules, permissions, or existing player records. Re-importing a file is what would apply the new PC rule.
