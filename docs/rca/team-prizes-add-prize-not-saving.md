# RCA: Team prize "Add Prize" rows not saving

## Symptom
- In the Team / Institution Prizes editor, newly added prize rows appeared, but after a refetch or page reload they vanished and never persisted.

## Root cause
- `TeamGroupPrizesTable` hydrated its draft state from `initialPrizes` inside `useEffect([initialPrizes])`. Upstream, `TeamPrizesEditor` filtered prizes per group inline, creating a **new array each render**. That changed the `initialPrizes` reference even when data was identical, so the hydration effect re-ran and overwrote unsaved local edits.

## Fix implemented
- **Stable grouping:** `TeamPrizesEditor` now memoizes `prizesByGroup` so each group's array reference only changes when the server data actually changes.
- **Hydration gating:** `TeamGroupPrizesTable` computes a server version key and skips hydration while local rows are dirty or saving, preventing clobbering of drafts.

## How to verify
- Add a team prize group, add multiple prizes, edit amounts, and confirm the "Unsaved changes" badge shows. Save, wait for refetch, and refresh the page—rows remain.
- Repeat with slow networks or multiple groups to ensure hydration only fires when Supabase returns new data.

## Future safeguards
- When refactoring the table, preserve the memoized grouping and the serverVersionKey guard. Avoid `useEffect` dependencies that can churn due to filtered arrays or object spreads.
