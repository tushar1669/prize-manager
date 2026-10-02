# Turn on import history (Step 3 of the girls-prize RCA)

## Goal
Every player import gets recorded, so the next time someone says "girls' prizes didn't fill" we can see which file was imported, when, how many rows came in, and how many girls were found and from which column.

## What already exists (checked)
- The import history table exists, with permissions in place: organizers can add and read records for their own tournaments; the master can read all.
- The Import page already has a hidden "Import History" panel (last 5 imports: date, file, sheet, rows accepted, top skip reasons).
- The import already builds a full record when it finishes. **It is never saved because the on/off switch defaults to OFF**, and it is not set anywhere. Result: 0 records in the whole product, ever.

## What changes
1. **Switch default ON.** Import history becomes on by default. It can still be turned off with the existing setting if ever needed.
2. **Add a gender summary to each record** (counts and column names only, no player names):
   - girls found, boys found, players with blank gender
   - which column the girls came from (e.g. "fs" or the untitled column), and whether Type/Group labels were used
3. **Show it in the Import History panel**: one extra line per import, e.g. "Girls found: 13 (from untitled column next to Name)". If 0, show it in warning colour.

Nothing else changes: allocation, prize rules, permissions, payments and publishing are untouched.

## What you will see
- Import page: an "Import History" card listing the last 5 imports for the tournament, each with file name, rows accepted and girls found.
- Records start from the first import after this change; past imports (including the earlier 19-player one) cannot be recovered.

## Check after implementation
- Unit tests pass.
- Re-import the attached Excel into tournament b8920c10 (Replace): one new history record appears showing 44 rows and "Girls found: 13".
- Confirm the record stores no player names, emails or dates of birth.
- Stop and wait for your OK before any other step (gender-column fix, Review message).

## Known side note (not fixed here)
The replace-import step in the live database does not write its own short history record, although an older migration file says it should. Recording now happens from the Import page, so this does not block the change. Flagged only; no database changes in this cycle.

## Technical details
- `src/utils/featureFlags.ts:4-5`: `IMPORT_LOGS_ENABLED = logsFlag ? logsFlag === 'true' : true` (env `VITE_IMPORT_LOGS_ENABLED=false` still disables). `.env` is auto-managed, so flipping the code default is the reliable switch.
- `src/pages/PlayerImport.tsx:1371-1402` (existing insert, unchanged otherwise): add `meta.gender_summary = { female_count, male_count, unknown_count, preferred_source, fs_column, headerless_column, female_sources_used }` from `femaleCountSummary` (state at line 574, set at 2426) plus a per-source tally computed from players' `gender_source`. Counts and header names only — PII rule respected.
- Existing `meta.import_summary` is the same object already stored on `tournaments.latest_import_quality`; no new data class introduced.
- `src/components/ImportLogsPanel.tsx`: select `meta`, render one "Girls found" line per row; warning style when `female_count === 0`.
- Side effect of turning the flag on: `ImportQualityNotes.tsx:174` uses the same flag default — verify its display still renders correctly.
- RLS verified: `import_logs_insert_owner` / `import_logs_select_owner` (owner or master); `authenticated` has INSERT/SELECT.
- Drift noted: live `import_replace_players` has no `import_logs` insert, while `20260216130000_issue_b_fix_replace_import_authorization.sql:129` has one. Not changed.
- Tests: add a unit test for the gender-summary builder (counts and sources, no names in output).
