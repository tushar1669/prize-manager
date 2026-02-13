# Prize-Manager User Guide

## Who this is for
Chess organizers and arbiters who run Swiss-Manager (or compatible) events and need transparent prize allocation from interim Swiss-Manager rankings.

## Supported inputs (Excel only)
- **Swiss-Manager interim ranking XLS/XLSX**
  - Uses the `fs` gender column (`F` = Female) with FMG/female-marker detection from Type/Group labels.
  - Reads DOB, rating, `type_label`, `group_label`, club, federation/state/city, and other standard Swiss-Manager columns.
  - FIDE age is computed on the tournament start date.
- **Manual player template XLSX**
  - Matches the in-app template (Rank, Name, Rating, DOB, gender/fs, FIDE number, state/city/club, Type/Group).
- Only Excel (.xls or .xlsx) files are supported.

## Player Import flow
1. Upload the Swiss-Manager interim ranking Excel file at **`/t/:id/import`** (`src/pages/PlayerImport.tsx`).
2. Map headers on the import screen. Auto-detection covers `Rank`, `SNo.`, `Name`, `Rtg/IRtg`, `Birth`, `fs` (gender), `Fide-No.`, and location fields. Headerless gender columns after the name column are detected when present.
3. Review inferred player data and warnings before confirming the import.

### Import preview table
- **Always-on columns:** Rank, Name, Rating, DOB, Gender.
- **Dynamic columns:** Additional columns appear only when needed by prize rules (`criteria_json`) — e.g., State, City, Club, Disability, Group, Type, and other configured criteria fields.
- **Warnings and banners:** Tie ranks, DOB year-only, and ranks auto-filled banners use theme-safe styling for dark mode.

### Known file quirk: Swiss-Manager duplicate “Name” columns
- Swiss-Manager exports often include multiple **Name** columns (e.g., full name + abbreviated).
- Client parsing deduplicates headers by renaming duplicates to **Name (2)**, **Name (3)**, etc., preventing `sheet_to_json` overwrite and allowing `detectFullVsAbbrevName()` to select the most complete name column. (`src/utils/sheetDetection.ts`, `src/components/ColumnMappingDialog.tsx`)

### Gender pipeline
- **Primary:** `fs` column (`F` → Female; blank stays unknown).
- **Header-based:** Explicit gender/sex column when mapped or auto-detected.
- **Headerless after Name:** Infers gender if an unlabeled column immediately follows Name and contains gender-like values.
- **FMG fallback:** Type/Group labels with `FMG`/female markers mark players as Female when explicit gender is missing.
- **Summary chip:** The Gender Summary badge shows:
  - OK (gender counts align with FMG),
  - Mismatch (soft warning), or
  - Hard warning (no females in the gender column but FMG indicates female players).

## Prize setup assumptions
- Categories can filter by age, gender, state/city, club, rating band, Type/Group labels, and special groups (FMG, PC, etc.).
- One-prize policy: each player can receive at most one prize. The allocator assigns the highest-priority eligible prize first.

## Tournament Settings

Tournament organizers can configure allocation rules at `/t/<id>/settings`. For a complete reference of all settings including defaults, allocator effects, and gotchas, see the **[Tournament Settings Reference](./TOURNAMENT_SETTINGS.md)**.

Key settings include:
- **Strict Age Eligibility** — Exclude DOB-less players from age categories (default: ON)
- **Allow Missing DOB for Age** — Treat DOB-less players as eligible with warning (default: OFF)
- **Inclusive Maximum Age** — Include players exactly at max_age boundary (default: ON)
- **Allow Unrated in Rating Bands** — Global fallback when categories do not specify `include_unrated` (default: OFF)
- **Main-first vs Place-first (Main vs Side only)** — Tie-break when cash/type match: `place_first` (default) or `main_first`
- **Age Band Policy** — `non_overlapping` (one band per child) or `overlapping` (cascading eligibility)
- **Prize Stacking Policy** — `single` (one prize per player), `main_plus_one_side`, or `unlimited`

## Review & Allocate
- **Route:** `/t/:id/review` (`src/pages/ConflictReview.tsx`).
- Click **Preview Allocation** to generate a provisional allocation.
- **Allocation Debug Report**
  - **Filled vs Unfilled** tabs show winners and missing prizes.
  - **Suspicious coverage** surfaces prizes with zero candidates or tight criteria.
  - **Diagnosis summary** explains why categories have zero eligible players (e.g., missing DOB, strict rating band, gender mismatch).
  - **"No eligible winner"** means no player matches the criteria after applying one-prize rules.
  - **Contrast note:** The report highlights “success” states with the success token for readable contrast in dark mode.
- **Exports**
  - **Coverage export (.xlsx):** prize-level eligibility, winner details, candidate counts before/after one-prize, reason codes, diagnosis summary.
  - **RCA export (.xlsx):** compares engine winners vs final winners with statuses (MATCH / OVERRIDDEN / NO_ELIGIBLE_WINNER), override reasons, and diagnostics.
- **Commit Allocation**
  - Allowed when only non-critical prizes remain unfilled. Critical missing fields block commit until resolved.
  - Committing locks winners and updates the public winners page.
- **Summary placement:** The summary block appears once, inline with the main results column (above the Winners/Unfilled panels). There is no duplicate sidebar summary.

## Finalize & Publish
- **Route:** `/t/:id/finalize` (`src/pages/Finalize.tsx`).
- **Tournament Summary totals:**
  - **Prize Fund (Organizer)** = `tournaments.cash_prize_total`.
  - **Prize Fund (Configured)** = sum of `prizes.cash_amount`.
  - **Cash Distributed** = sum of winners’ allocated prize cash.
- **Allocation Summary counts:** Winners Allocated and Unfilled Prizes are shown alongside main/category/trophy/medal counts.

## Print outputs
- **`/t/:id/final/v1` (Card view):** Category cards flow dynamically; the layout no longer forces one-category-per-page, while still avoiding mid-card splits.
- **`/t/:id/final/v3` (Poster grid):** A toolbar toggle lets you switch **Compact** vs **One per page**; the toggle itself is hidden in print output. (`src/components/final-prize/FinalPrizeSummaryHeader.tsx`)

## Team / Institution Prizes
Team prizes (Best School, Best Academy, Best City, etc.) are configured separately from individual prizes.

### Configuration
1. Navigate to **Tournament Setup → Team / Institution Prizes** tab.
2. Click **Add Team Prize Group** to create a new group:
   - **Group Name**: Label shown in outputs (e.g., "Best School").
   - **Group Players By**: Select `club`, `city`, `state`, `group_label`, or `type_label`.
   - **Team Size**: Number of players counted per team.
   - **Gender Requirements** (optional): Set female_slots and/or male_slots; totals cannot exceed team_size.
3. Expand the group → **Add Prize** rows with place, cash amount, trophy, and medal options.
4. Save changes before leaving the page.

### How team allocation works
- **Isolation**: Team prizes are completely separate from individual prizes. Players can win both.
- **Scoring**: Teams are ranked by total rank points (higher is better). Tie-breaks: total points → rank sum → best individual rank → institution name.
- **Gender slots**: `female_slots` require gender = F; `male_slots` accept not-F (male or unknown).

### Where team results appear
- **Conflict Review**: After individual preview completes, team results appear in a separate panel.
- **Finalize**: Team winners shown alongside individual winners.
- **PDF Export**: Includes a "Team / Institution Prizes" section at the end.

## Public pages
- **Public home listing:** Shows the newest published tournaments first with time-control badge (BLITZ/RAPID/CLASSICAL), arbiter/director names, entry fees, cash prize totals, city/venue, brochure and ChessResults/public-result links when provided.
- **Public tournament detail & winners:** Displays event summary, schedule, external links, and final winners/allocations for viewers without organizer access.

## Known limitations
- FIDE age calculations use the tournament start date; out-of-range DOBs remain ineligible.
- Requires a clean Swiss-Manager Excel export; corrupted spreadsheets are not auto-repaired.
- Some categories may legitimately end with **No eligible winner** when criteria are too strict or fields are missing. This is expected and still commit-safe for non-critical prizes.
- Only Excel (.xls or .xlsx) files are supported anywhere in the flow.

Related: [Glossary](./GLOSSARY.md).
