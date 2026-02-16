# Release Smoke Tests: Gift + Bundle-aware Non-cash Priority

Run these checks in staging/production after deploying `allocatePrizes` and publishing frontend.

## 1) Prize editor: gift items persist
1. Open **Tournament Setup** for a test tournament.
2. In any category prize row, add one or more gift items (e.g. `Chess Clock x1`, `Book x2`).
3. Save tournament changes.
4. Refresh the page.
5. Confirm the same gift items are still present for that prize.

## 2) Settings: non-cash priority visibility + default + banner
1. With **no gifts configured** across active prizes, open **Settings**.
2. Confirm **Non-cash priority mode** control is hidden.
3. Add at least one gift item to an active prize, save, and return to **Settings**.
4. Confirm **Non-cash priority mode** is visible.
5. Confirm default value is **TGM** when no explicit mode was previously set.
6. Confirm the explanatory banner/text for non-cash priority is shown.

## 3) Allocation: equal-cash TM vs T should pick TM first
1. Prepare two eligible players with distinct ranks.
2. Prepare two equal-cash prizes in the same allocation run:
   - Prize A: Trophy only (`T`)
   - Prize B: Trophy + Medal (`TM`)
3. Run allocation from **Conflict Review** (or invoke `allocatePrizes`).
4. Confirm the higher-priority player receives **TM** before **T**, regardless of Main-vs-Place mode.

## 4) Exports: additive gift columns + backward compatibility
1. Generate allocation exports (coverage/RCA/final prize export as applicable).
2. Confirm new gift-related columns are present:
   - **Has Gift**
   - **Gift Items**
3. Confirm pre-existing columns are unchanged in name/order/content.
