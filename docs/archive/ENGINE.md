# Engine Documentation Index

This section documents the allocation engine in two audiences:

- **Organizers / operators:** [`ENGINE_USER.md`](./ENGINE_USER.md)
- **Developers / maintainers:** [`ENGINE_TECHNICAL.md`](./ENGINE_TECHNICAL.md)

## Source-of-truth implementation files
- `supabase/functions/allocatePrizes/index.ts`
- `supabase/functions/finalize/index.ts`
- `src/pages/ConflictReview.tsx`
- `src/components/allocation/AllocationDebugReport.tsx`
- `src/utils/allocationCoverageExport.ts`
- `src/utils/allocationRcaExport.ts`
- `src/types/allocation.ts`
- `src/types/rca.ts`
- `tests/allocation/*.spec.ts`

## Related docs
- [`EXPORTS_COVERAGE_VS_RCA.md`](./EXPORTS_COVERAGE_VS_RCA.md)
- [`RULES_AND_SETTINGS_REFERENCE.md`](./RULES_AND_SETTINGS_REFERENCE.md)
- [`SECURITY_ACCESS_CONTROL.md`](./SECURITY_ACCESS_CONTROL.md)
- [`TOURNAMENT_ISOLATION.md`](./TOURNAMENT_ISOLATION.md)
- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

## Maintenance notes
- Keep both docs code-grounded; avoid speculative behavior.
- If behavior is unclear, mark **UNKNOWN** and point to the exact file area to verify.
