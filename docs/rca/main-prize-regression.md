# RCA: Main Prize disappeared in Individual mode

## Symptom
- In tournaments set to **individual prize mode**, the "Main Prize" category vanished or was never created, causing allocations and UI guards (main-first sorting) to behave incorrectly.

## Root cause
- Legacy tournaments could toggle prize modes without ensuring an `is_main` category existed. When categories were loaded in Setup, the data could be missing the main category entirely, leaving the UI list and allocator without a primary category to anchor ordering.

## Fix implemented
- **TournamentSetup**: on prize tab load in individual mode, auto-inserts a `Main Prize` category (order_idx=0, is_main=true) if absent before hydration completes.
- **CategoryPrizesEditor**: guards prevent disabling, deleting, or editing rules for the main category; the main card stays first in the Setup ordering.

## Preventing recurrence
- Keep the ensure-main check in Setup for individual prize mode; do not remove the guard when refactoring tabs or queries.
- Do not allow bulk deactivate/delete flows to target `is_main` categories; keep sorting that pins the main category before others.
- When adding migrations or import flows, assert a single main category per individual-mode tournament.
