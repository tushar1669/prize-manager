# Exports: Coverage vs RCA

This page explains the two review exports from `/t/:id/review`.

## Coverage export (broad visibility)
- **Purpose:** full allocation coverage context for prizes/winners and non-critical diagnostics.
- **Use when:** you want a comprehensive review spreadsheet for arbiters/organizers.
- **Code path:** `src/utils/allocationCoverageExport.ts`.
- **Typical interpretation:** each row represents a prize-level allocation/coverage outcome and related diagnostic fields.

## RCA export (root-cause focus)
- **Purpose:** focused analysis of **unfilled** prizes and why they stayed unfilled.
- **Use when:** you need to debug missing winners or explain unresolved allocations.
- **Code path:** `src/utils/allocationRcaExport.ts`.
- **Important behavior:** exporter warns/returns no file when there are no unfilled rows.

## When to use which
- Use **Coverage** first for overall health.
- Use **RCA** when coverage shows unresolved or critical unfilled outcomes.
- In review meetings, attach both: Coverage for full traceability, RCA for decision/action items.

## Column-level meaning
Exact column names can evolve with export mappers. Verify current columns in:
- `src/utils/allocationCoverageExport.ts`
- `src/utils/allocationRcaExport.ts`

If you need a hard mapping table for a release, generate a sample export from `/t/:id/review` and freeze that sample in release notes (process location **UNKNOWN**, team-dependent).

## Common misreads
- "No RCA file" does **not** mean export is broken; it can mean there are no unfilled rows.
- High coverage row counts do **not** automatically indicate errors; inspect critical/unfilled indicators.
- Differences between UI totals and spreadsheets should be validated against the same preview run (avoid comparing across runs).

## Suggested decision workflow
1. Run preview in `/t/:id/review`.
2. Export Coverage and scan critical/unfilled sections.
3. Export RCA and isolate unfilled root causes.
4. Adjust setup/rules if needed, rerun preview, then re-export.
5. Finalize/publish only after critical issues are resolved.

## Related docs
- `docs/KEY_USER_FLOWS.md`
- `docs/TROUBLESHOOTING.md`
- `docs/GLOSSARY.md`
