# Testing and QA checklist

## Commands
- Build: `npm run build`
- Unit/component tests: `npx vitest`

## Manual QA scripts
- **Baseline (no team prizes):** Import players, configure individual prizes, run Preview → Conflict Review → Finalize. Ensure individual winners render and PDF export succeeds.
- **With team prizes:** Configure a team prize group and prizes, run Preview. Verify team results show in Conflict Review after preview completes, remain visible in Finalize, and appear in the PDF export.
- **Draft persistence:** In Team / Institution Prizes, add prize rows, confirm the "Unsaved changes" hint, save, and refresh—rows should persist with no silent deletions.
- **Gender slots edge cases:** Set female_slots/male_slots near team_size and ensure validation blocks invalid totals and allocation marks ineligible institutions when slots cannot be met.
