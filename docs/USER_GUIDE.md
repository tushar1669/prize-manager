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
- **CSV is NOT supported.**

## Player Import flow
1. Upload the Swiss-Manager interim ranking Excel file.
2. Map headers on the import screen. Auto-detection covers `Rank`, `SNo.`, `Name`, `Rtg/IRtg`, `Birth`, `fs` (gender), `Fide-No.`, and location fields. Headerless gender columns after the name column are detected when present.
3. Review inferred player data and warnings before confirming the import.

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

## Review & Allocate
- Click **Preview Allocation** to generate a provisional allocation.
- **Allocation Debug Report**
  - **Filled vs Unfilled** tabs show winners and missing prizes.
  - **Suspicious coverage** surfaces prizes with zero candidates or tight criteria.
  - **Diagnosis summary** explains why categories have zero eligible players (e.g., missing DOB, strict rating band, gender mismatch).
  - **"No eligible winner"** means no player matches the criteria after applying one-prize rules.
- **Exports**
  - **Coverage export (.xlsx):** prize-level eligibility, winner details, candidate counts before/after one-prize, reason codes, diagnosis summary.
  - **RCA export (.xlsx):** compares engine winners vs final winners with statuses (MATCH / OVERRIDDEN / NO_ELIGIBLE_WINNER), override reasons, and diagnostics.
- **Commit Allocation**
  - Allowed when only non-critical prizes remain unfilled. Critical missing fields block commit until resolved.
  - Committing locks winners and updates the public winners page.

## Public pages
- **Public home listing:** Shows the newest published tournaments first with time-control badge (BLITZ/RAPID/CLASSICAL), arbiter/director names, entry fees, cash prize totals, city/venue, brochure and ChessResults/public-result links when provided.
- **Public tournament detail & winners:** Displays event summary, schedule, external links, and final winners/allocations for viewers without organizer access.

## Known limitations
- FIDE age calculations use the tournament start date; out-of-range DOBs remain ineligible.
- Requires a clean Swiss-Manager Excel export; corrupted spreadsheets are not auto-repaired.
- Some categories may legitimately end with **No eligible winner** when criteria are too strict or fields are missing. This is expected and still commit-safe for non-critical prizes.
- **CSV is NOT supported** anywhere in the flow.
