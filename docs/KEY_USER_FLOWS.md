# Key User Flows

Canonical operator flow for individual prize workflows:

## 1) Import players
- **Route:** `/t/:id/import`
- **Primary actions:** upload Swiss-Manager XLS/XLSX, map columns, resolve conflicts, save players.
- **Artifacts:** imported players, optional conflict export, import quality signals.
- **Where implemented:** `src/pages/PlayerImport.tsx`.
- **Failure checkpoint:** if column mapping/validation fails, inspect import schema + dedup signals in `src/utils/importSchema.ts` and `src/utils/dedup.ts`.

## 2) Preview allocation
- **Route:** `/t/:id/review`
- **Primary actions:** run preview allocation, inspect winners/conflicts/unfilled rows.
- **Artifacts:** preview winners + coverage + unfilled diagnostics returned from `allocatePrizes`.
- **Where implemented:** `src/pages/ConflictReview.tsx`, `supabase/functions/allocatePrizes/index.ts`.
- **Failure checkpoint:** if preview fails, verify edge function health and auth/session; see `docs/TROUBLESHOOTING.md`.

## 3) Debug and diagnose
- **Route:** `/t/:id/review`
- **Primary actions:** inspect coverage entries and critical/unfilled diagnosis.
- **Artifacts:** coverage table + diagnosis summaries in review UI.
- **Where implemented:** `src/pages/ConflictReview.tsx`.
- **Failure checkpoint:** if results look wrong, export both coverage and RCA and compare with category/prize settings.

## 4) Export diagnostics (Coverage vs RCA)
- **Route:** `/t/:id/review`
- **Primary actions:** export Coverage report and RCA report.
- **Artifacts:** XLSX files generated from:
  - `src/utils/allocationCoverageExport.ts`
  - `src/utils/allocationRcaExport.ts`
- **Failure checkpoint:** if export is empty, verify preview was completed and that unfilled RCA rows exist.

## 5) Finalize and publish
- **Routes:** `/t/:id/finalize` -> `/t/:id/publish`
- **Primary actions:** finalize allocations, publish tournament, verify public URL.
- **Artifacts:** persisted finalized allocations + publication version.
- **Where implemented:** `src/pages/Finalize.tsx`, `supabase/functions/finalize/index.ts`, `src/pages/PublishSuccess.tsx`.
- **Failure checkpoint:** if publish fails, inspect RPC/update errors in finalize logs and confirm public pages query only published records.

## Related docs
- `docs/USER_GUIDE.md`
- `docs/EXPORTS_COVERAGE_VS_RCA.md`
- `docs/GLOSSARY.md`
- `docs/TROUBLESHOOTING.md`
