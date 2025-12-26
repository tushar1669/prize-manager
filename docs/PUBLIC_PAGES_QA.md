# Public Pages – Production QA Checklist

Quick regression tests for public-facing tournament pages.

---

## Home Page (`/`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 1 | Page loads without errors | No console errors, no blank screen |
| 2 | Tournament cards render | At least one card visible (or "No published tournaments" message) |
| 3 | Each card shows title, dates, location | All three fields populated, no "undefined" |
| 4 | "View Details" button present | Button visible and clickable on each card |
| 5 | Load time acceptable | Cards appear within 2 seconds |

---

## Tournament Details (`/p/:slug`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 6 | Navigate from home → details | Click "View Details" → URL changes to `/p/{slug}` |
| 7 | No error toast | "Unable to load tournament details" does NOT appear |
| 8 | Title + dates display | Tournament name and date range visible in header |
| 9 | Venue/city display | Location info shown (or gracefully omitted if empty) |
| 10 | Back button works | Click back → returns to `/` |

---

## Results Page (`/p/:slug/results`)

| # | Check | Pass Criteria |
|---|-------|---------------|
| 11 | Direct navigation works | Go to `/p/{slug}/results` → page loads |
| 12 | Empty state or results table | Shows "No results" message OR populated table |
| 13 | Back button works | Returns to home (`/`) |

---

## Cross-Cutting

| # | Check | Pass Criteria |
|---|-------|---------------|
| 14 | Browser back/forward | History navigation works, no stale data |
| 15 | Mobile responsive | Cards and details readable on 375px width |

---

## Quick Smoke Test Flow

```
1. Open /
2. Verify tournament list loads
3. Click first "View Details"
4. Verify details page shows title, dates, venue
5. Navigate to /p/{slug}/results
6. Verify results or empty state
7. Click back → home
8. Browser back/forward → no errors
```

**Last updated:** 2024-12-26
