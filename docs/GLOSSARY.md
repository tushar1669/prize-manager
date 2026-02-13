# Glossary

Concise UI and workflow terms used across import/review/finalize/public pages.

- **Preview Allocation**: Review-stage allocation run before commit/publish (`/t/:id/review`).
- **Conflict Review**: Page where preview winners/conflicts/unfilled diagnostics are reviewed (`src/pages/ConflictReview.tsx`).
- **Coverage**: Broad allocation export/report used for full audit context (`src/utils/allocationCoverageExport.ts`).
- **RCA (Root Cause Analysis)**: Focused export for unfilled prize causes (`src/utils/allocationRcaExport.ts`).
- **Unfilled**: Prize with no allocated winner after preview.
- **Diagnosis Summary**: Review diagnostics explaining conflicts/eligibility/unfilled outcomes.
- **Finalize**: Step that persists allocation decisions before public publishing (`/t/:id/finalize`).
- **Publish**: Action that makes tournament outputs visible in public surfaces (`/t/:id/publish`).
- **Main vs Side**: Priority mode influencing main-prize ordering behavior (see settings docs and allocator behavior).
- **One-prize policy / multi-prize policy**: Whether a player can receive only one prize or multiple (individual allocator configuration).
- **Public tournament page**: Viewer-facing routes (`/public`, `/p/:slug`, `/p/:slug/results`).
- **Master user**: Elevated role required for protected admin/master routes (`/master-dashboard`, `/admin/tournaments`).

If a term appears in UI but is not listed here, treat definition as **UNKNOWN** and verify in component text under `src/pages/*` and `src/components/*`.
