# Prize Allocation Algorithm — Canonical Docs

**Status:** Canonical docs are now in `docs/ALGORITHM_PLAIN_ENGLISH.md` and `docs/ALGORITHM_RULES.md`. This file is kept as a thin index to avoid drift.

## Where to read the current algorithm
- **Plain English walkthrough:** [docs/ALGORITHM_PLAIN_ENGLISH.md](../ALGORITHM_PLAIN_ENGLISH.md)
- **Numbered rules reference:** [docs/ALGORITHM_RULES.md](../ALGORITHM_RULES.md)
- **Priority hierarchy details:** [docs/allocator/prize-priority-hierarchy.md](./prize-priority-hierarchy.md)

## One‑screen summary (grounded)
- **Entrypoint:** Allocation preview runs in `allocatePrizes` (supabase/functions/allocatePrizes/index.ts → `Deno.serve`, lines ~344–1124).
- **Prize priority:** Prizes are ordered globally by cash → prize type → place/main (mode) → brochure order → id. (supabase/functions/allocatePrizes/index.ts → `makePrizeComparator`, lines ~1623–1659; `prizeKey`, lines ~1596–1614)
- **Winner selection:** Standard categories pick lowest rank; youngest categories pick youngest DOB. (supabase/functions/allocatePrizes/index.ts → `compareEligibleByRankRatingName`, lines ~1683–1715; `compareYoungestEligible`, lines ~1736–1766)
- **Finalize:** Committed allocations are written by the `finalize` edge function. (supabase/functions/finalize/index.ts → `Deno.serve`, lines ~150–214)
