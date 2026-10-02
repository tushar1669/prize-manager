# RCA: "Top 3 Girls" not filling — tournament b8920c10 (2nd LEARNERS Under-09)

## 1. What the evidence shows (all read-only checks)

**Tournament setup (database)**
- 2 categories: Main Prize (10 prizes) and **Top 3 Girls** (3 prizes, rule = Girls only, unrated allowed, no rating/age limits). The category rule is correct.
- No allocations committed yet; tournament is a draft.

**Your Review page session (preview console, 10:16–10:17 UTC)**
- `[review] players: 19 prizes: 13 winners: 10 conflicts: 0 unfilled: 3` — the 3 unfilled prizes are exactly the 3 girls' prizes.
- At that moment the tournament had **19 players**.

**Current player list (database, now)**
- **44 players, all re-imported at 10:19:18 UTC** (after that Review session). 13 are recorded as girls (F), 31 blank.
- That matches the attached Excel exactly: 44 players, 13 marked F.

**The attached Excel (Swiss-Manager ranking list)**
- The **"fs" column is completely empty** for every player.
- The girls' "F" markers are in a **column with no title**, between the second "Name" column and "Rtg" (column F).
- Running the file through the app's own import logic: the importer still finds all 13 girls (it checks both the "fs" column and the untitled column). So the current player list is correct.

**Engine rule (unchanged, not touched)**
- Girls-only prizes accept only players recorded as F; blank = not eligible. With the current 44 players, the expected Top 3 Girls are: **Upadhriti Shreeraj (rank 12), Anshika (rank 15), Kaira Gupta (rank 16)** — none of them win a Main prize (ranks 1–10 are all boys).

## 2. Root cause

**Primary (confirmed):** the Review result you saw was computed on an **earlier 19-player list in which no player was recorded as female**. Girls-only prizes correctly stayed unfilled because zero eligible girls existed in that data. Among ranks 1–19 of the attached file there are 3 girls, so that earlier list either came from a different/older file or was imported without the female markers.

**Why we can't prove which (confirmed gap):** the import history table has **zero rows across the whole product** — import logging is switched off. The earlier 19-player list was replaced at 10:19 and cannot be reconstructed. This is also why this keeps being "reported again" without a traceable cause.

**Contributing (confirmed, misleading UI):** for files like this one, the importer chooses the empty "fs" column as "the gender column" (it ranks "fs" above the untitled column even when "fs" is blank). Consequences:
- Column mapping auto-selects gender ← "fs" (an empty column), so the organizer sees gender mapped to a blank column.
- The import summary reports the gender source as "fs column", although every F actually came from the untitled column.
- An organizer reasonably concludes "gender isn't being read", re-maps or re-imports, and results vary.

**Excel data issues (not the cause, but worth correcting in Swiss-Manager)**
- "fs" column empty; F markers in an untitled column (Swiss-Manager export layout quirk — accepted by the app).
- **Pranav Miglani** marked F (name suggests a boy — please verify).
- **Ayukta Tyagi** not marked F (name suggests a girl — please verify; she is currently excluded from girls' prizes).
- **Vaibhav Nandvanshi**'s second Name column says "Sehaj Phukela" (copy error in the file).
- Shivya Tiglania has no rank (tie at 23/24); the app fills it.

## 3. Proposed fix (step by step, with a check after each)

**Step 0 — immediate, no code (you):** open Review, click **Preview** again. Expected: Top 3 Girls = Upadhriti Shreeraj, Anshika, Kaira Gupta. If it still shows unfilled, export the RCA file and share it (it lists the exact reason per prize). Stop here until confirmed.

**Step 1 — correct gender-column choice (import only):** when the "fs" column has no female markers but the untitled column between Name and Rtg does, choose the untitled column as the gender column. Same rule in the browser importer and the server importer so they agree. Result: mapping shows the right column, the summary names the right source. Player gender values for this file do not change (still 13 F).

**Step 2 — clear message on Review (display only):** when a girls-only category ends with unfilled prizes, show "N players in this tournament are recorded as female" and, if 0, "Your player list has no girls marked — check the gender column in Import". Also show "Player list changed since the last Preview — run Preview again" when players were re-imported after the last preview.

**Step 3 — turn on import history (needs your approval):** enable import logging and include a gender summary (girls found, which column was used) so the next report can be traced to the exact file and import.

Each step is a separate cycle: implement, run unit tests, verify with this Excel, then wait for your OK before the next.

## Out of scope / not touched
- Prize allocation engine and its gender rule (girls = explicit F only).
- Database rules, permissions, storage, payments, publishing.
- No CSV, no broad refactors.

## Technical details
- Gender detection: `src/utils/genderInference.ts` `analyzeGenderColumns` — `preferredColumn = genderColumn || fsColumn || headerlessGenderColumn` (line 61). For this file: `fsColumn="fs"` (all blank), `headerlessGenderColumn="__EMPTY_COL_5"` (13 F) → preferred = "fs". `inferGenderForRow` (lines 241–265) reads both, so inference is correct.
- Auto-mapping uses `preferredColumn`: `src/pages/PlayerImport.tsx:2648-2654`; summary source: `PlayerImport.tsx:2417-2420`.
- Server mirror: `supabase/functions/parseWorkbook/index.ts:496-521` (same precedence). Server import is currently off, so the browser path is used.
- Step 1 change: prefer `fsColumn` only if it contains at least one female signal; otherwise fall back to `headerlessGenderColumn`. Add unit tests (fs empty + headerless F → headerless chosen; fs with F → fs kept; neither → null).
- Step 2: `src/pages/ConflictReview.tsx` only — count `gender==='F'` from the already-loaded players; compare latest player `created_at` with last preview time.
- Step 3: `IMPORT_LOGS_ENABLED` (`src/utils/featureFlags.ts:4-5`, env `VITE_IMPORT_LOGS_ENABLED`, default false) — `import_logs` has 0 rows total. Add `meta.gender_summary` to the existing insert in `PlayerImport.tsx:1372-1398`.
- Engine reference (unchanged): `supabase/functions/allocatePrizes/index.ts:1526-1556`.
