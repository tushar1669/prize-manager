# Testing and QA checklist

## Commands
- Build: `npm run build`
- Unit/component tests: `npx vitest`

## Manual QA scripts
- **Baseline (no team prizes):** Import players, configure individual prizes, run Preview → Conflict Review → Finalize. Ensure individual winners render and PDF export succeeds.
- **With team prizes:** Configure a team prize group and prizes, run Preview. Verify team results show in Conflict Review after preview completes, remain visible in Finalize, and appear in the PDF export.
- **Draft persistence:** In Team / Institution Prizes, add prize rows, confirm the "Unsaved changes" hint, save, and refresh—rows should persist with no silent deletions.
- **Gender slots edge cases:** Set female_slots/male_slots near team_size and ensure validation blocks invalid totals and allocation marks ineligible institutions when slots cannot be met.

## QA checklist (Import/Review/Finalize/Print)
- **Swiss-Manager duplicate Name handling:** Import a Swiss-Manager XLS/XLSX with multiple Name columns and confirm headers appear as Name, Name (2), Name (3), etc., and the full-name column is selected for mapping. (`/t/:id/import`)
- **Dynamic preview columns:** Configure prize criteria (`criteria_json`) that require State/City/Club/Disability/Group/Type and confirm only those extra columns appear in the preview table. (`/t/:id/import`)
- **Finalize totals:** Confirm Tournament Summary shows three totals: Prize Fund (Organizer), Prize Fund (Configured), and Cash Distributed. (`/t/:id/finalize`)
- **Print v1 flow:** Confirm category cards flow dynamically without forcing one category per page, and cards do not split mid-card. (`/t/:id/final/v1`)
- **Print v3 toggle:** Confirm the Poster Grid offers Compact vs One per page in the toolbar, and the toggle is hidden in print output. (`/t/:id/final/v3`)
