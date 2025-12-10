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

Prize allocation always hands out the **best overall prize first** using a global comparator (cash ↓, trophy/medal power ↓, place ↑, main vs sub, brochure order ↑, prize ID) to keep results deterministic. Age eligibility follows a configurable `age_band_policy`: new tournaments default to **non-overlapping** Under-X bands (one age band per child), while migrated tournaments keep **overlapping** Under-X ranges until the director toggles the policy in Edit Rules.

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
- [Technical Overview](./docs/TECH_OVERVIEW.md)
- [Prize Allocation Algorithm Specification](./docs/allocator/README.md)
- [Organizer Guide: How Prizes Are Decided](./docs/allocator/organizer-guide.md)
- [State Code Auto-Extraction](./docs/import-state-extraction.md)

## Testing

```bash
npm run test
npm run build
```
