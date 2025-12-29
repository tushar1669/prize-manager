# Prize-Manager

Prize-Manager helps chess arbiters allocate prizes for Swiss-Manager style tournaments. It imports Swiss-Manager interim Excel rankings, applies configured prize rules, and publishes transparent results without touching the underlying allocation logic.

## Core flows
- **Tournament Setup** – Configure dates, location, arbiters, directors, time control, and basic metadata.
- **Player Import** – Upload a Swiss-Manager interim ranking Excel file, map headers, and review inferred player data.
- **Prize Setup** – Define main prizes and category prizes with rating/age/gender/location/type/group filters.
- **Preview Allocation** – Run the allocator to see projected winners and coverage details.
- **Conflict Review & Commit** – Inspect debug coverage, resolve conflicts, and commit final winners.
- **Public Tournament Pages** – Publish a public listing and winners page for external viewers.
- **Exports (Coverage & RCA)** – Download Excel coverage and RCA reports for auditing.

Prize allocation always hands out the **best overall prize first** using a global comparator (cash ↓, trophy/medal power ↓, place ↑, main vs sub, brochure order ↑, prize ID) to keep results deterministic. Age eligibility follows a configurable `age_band_policy`: new tournaments default to **non-overlapping** Under-X bands (one age band per child), while migrated tournaments keep **overlapping** Under-X ranges until the director toggles the policy in Edit Rules. Gender filters have three options: blank (**Any**), `F` (**Girls Only**), and `M_OR_UNKNOWN` (**Boys / not-F**; legacy `M` maps here). The UI no longer exposes "Boys Only" and only persists `F`, `M_OR_UNKNOWN`, or blank.

## Quick Start (for organizers)
1. Create a tournament.
2. Fill the Tournament Setup form (dates, venue, time control, arbiter/director, fees).
3. Import players using the Swiss-Manager interim ranking **XLS/XLSX** file.
4. Define prizes and category criteria.
5. Use **Preview Allocation** to debug coverage and eligibility.
6. Commit the allocation, then share the public link or final PDF.

## Tech stack
- **Frontend:** React + TypeScript, Vite, shadcn/ui, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Edge Functions:** `parseWorkbook` for Excel parsing + gender inference, `allocatePrizes` for allocation/coverage/diagnosis
- **Exports:** Excel-only (`.xls`/`.xlsx`) for player import, coverage, RCA, and print/PDF workflows

## Documentation
- [User Guide](./docs/USER_GUIDE.md)
- [Tournament Settings Reference](./docs/TOURNAMENT_SETTINGS.md) — Allocation toggles with defaults, effects, and gotchas (including Main-first vs Place-first)
- [Technical Overview](./docs/TECH_OVERVIEW.md)
- [Prize Allocation Algorithm Specification](./docs/allocator/README.md)
- [Organizer Guide: How Prizes Are Decided](./docs/allocator/organizer-guide.md)
- [State Code Auto-Extraction](./docs/import-state-extraction.md)
- [Algorithm (Plain English)](./docs/ALGORITHM_PLAIN_ENGLISH.md)
- [Algorithm Rules Reference](./docs/ALGORITHM_RULES.md)
- [Rules & Settings Reference](./docs/RULES_AND_SETTINGS_REFERENCE.md)
- [Operations, Release & Testing](./docs/OPERATIONS_RELEASE_TESTING.md)

## Docs index (A–Z product docs)
- [Product Working Notes](./docs/PRODUCT_WORKING.md)
- [Algorithm Rules](./docs/ALGORITHM_RULES.md)
- [Algorithm (Plain English)](./docs/ALGORITHM_PLAIN_ENGLISH.md)
- [Rules & Settings Reference](./docs/RULES_AND_SETTINGS_REFERENCE.md)
- [Architecture & Data Model](./docs/ARCHITECTURE_AND_DATA_MODEL.md)
- [Operations, Release & Testing](./docs/OPERATIONS_RELEASE_TESTING.md)
- [Troubleshooting](./docs/TROUBLESHOOTING.md)

## Security & Roles
- [Security & Access Control](./docs/SECURITY_ACCESS_CONTROL.md) – roles, master allowlist, verification lifecycle, route guards
- [Auth Callback Flow](./docs/AUTH_CALLBACK.md) – PKCE, hash tokens, redirect rules, resend confirmation
- [Tournament Isolation](./docs/TOURNAMENT_ISOLATION.md) – RLS rules, the historical `list_my_tournaments` leak and fix

## Team / Institution Prizes (Phase 2)
- **What**: A separate Phase-2 module for Best School/Academy/City/State teams. Uses dedicated `institution_prize_groups` and `institution_prizes` tables and the `allocateInstitutionPrizes` edge function (distinct from `allocatePrizes`). Players can win both individual and team prizes; multi_prize_policy is ignored for team awards.
- **Where to configure**: Tournament Setup → Team / Institution Prizes panel. Add a group (choose grouping column, team size, gender slots, scoring mode) then add prizes per place. See [docs/team-prizes.md](./docs/team-prizes.md) for a full walkthrough.
- **Outputs**: Team prize winners render in Conflict Review (after preview finishes), Finalize, and the PDF export (`generatePdf` calls `allocateInstitutionPrizes` when active groups exist).
- **Current scoring**: Rank-points sum of top-K players (higher points = better); tie-breaks on rank_sum then best individual rank (see allocator code for details). Future scoring modes are planned for Phase 2.2.
- **Isolation from main allocator**: Team prizes do not affect individual allocations, eligibility, or prize ordering; they simply display alongside the main results.

## Testing

```bash
npm run test
npm run build
```

## How to run smoke locally

```bash
npm install
npm run test:smoke
```

## Troubleshooting
- **Main Prize missing (individual mode)**: TournamentSetup auto-creates a `Main Prize` category if none exists when prize_mode = individual, and CategoryPrizesEditor prevents disabling/deleting the main category. If the main category is missing, reload Setup to trigger the ensure step and re-run allocations.
- **Add Prize not saving (team prizes)**: Draft rows could be overwritten by refetch hydration when array references changed. The TeamPrizesEditor now memoizes `prizesByGroup` and TeamGroupPrizesTable gates hydration while edits are dirty. If rows disappear, ensure you saved changes (watch for the “Unsaved changes” hint) and that the refetch completed.
