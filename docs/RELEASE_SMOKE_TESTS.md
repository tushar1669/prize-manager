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

## 5) Referral cross-device capture
1. As User A, generate a referral code on `/account`.
2. Open the referral signup link in a different browser/incognito window.
3. Sign up as User B. Confirm email on a third device or same device.
4. Log in as User B → verify referral was captured (check User A's `/account` for the referred user, or run `SELECT * FROM referrals WHERE referrer_id = '<user_a_id>' ORDER BY created_at DESC LIMIT 1;`).

## 6) Profile completion reward + admin visibility
1. As an organizer, complete all 5 profile fields on `/account`.
2. Click "Claim Reward" → confirm success toast.
3. Log in as master → `/admin/coupons` → search `PROFILE-`.
4. Confirm the coupon appears with origin badge "System" and correct `issued_to_email`.

## 7) Referral reward coupons + admin drilldown
1. Complete a Pro upgrade for a referred organizer (via UPI approval or 100% coupon).
2. Log in as master → `/admin/coupons` → search `REF1-`.
3. Confirm L1 coupon exists with origin `referral_l1` and correct `issued_to_email` (the referrer).
4. Click the coupon row → drilldown should show trigger user and tournament context.

## 8) Manual UPI payment approval → entitlement
1. As organizer, submit a UTR on `/t/:id/upgrade`.
2. As master, go to `/master-dashboard` → Payment Approvals.
3. Approve the payment.
4. Confirm the organizer's tournament now shows Pro access (no paywall, full features).
5. Verify: `SELECT * FROM tournament_entitlements WHERE tournament_id = '<id>' LIMIT 1;`

## 9) Martech drilldown sanity
1. Log in as master → `/admin/martech`.
2. Confirm funnel charts render with non-zero counts (if data exists).
3. Click any bar → drilldown panel opens with records.
4. Verify no blank/error states in the drilldown.
