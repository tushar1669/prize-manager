# Testing and QA checklist

## Commands
- Build: `npm run build`
- Unit/component tests: `npx vitest`

## Manual QA scripts
- **Baseline (no team prizes):** Import players, configure individual prizes, run Preview → Conflict Review → Finalize. Ensure individual winners render and PDF export succeeds.
- **With team prizes:** Configure a team prize group and prizes, run Preview. Verify team results show in Conflict Review after preview completes, remain visible in Finalize, and appear in the PDF export.
- **Draft persistence:** In Team / Institution Prizes, add prize rows, confirm the "Unsaved changes" hint, save, and refresh—rows should persist with no silent deletions.
- **Gender slots edge cases:** Set female_slots/male_slots near team_size and ensure validation blocks invalid totals and allocation marks ineligible institutions when slots cannot be met.

## QA checklist (Import/Review/Finalize/Print)
- **Swiss-Manager duplicate Name handling:** Import a Swiss-Manager XLS/XLSX with multiple Name columns and confirm headers appear as Name, Name (2), Name (3), etc., and the full-name column is selected for mapping. (`/t/:id/import`)
- **Dynamic preview columns:** Configure prize criteria (`criteria_json`) that require State/City/Club/Disability/Group/Type and confirm only those extra columns appear in the preview table. (`/t/:id/import`)
- **Finalize totals:** Confirm Tournament Summary shows three totals: Prize Fund (Organizer), Prize Fund (Configured), and Cash Distributed. (`/t/:id/finalize`)
- **Print v1 flow:** Confirm category cards flow dynamically without forcing one category per page, and cards do not split mid-card. (`/t/:id/final/v1`)
- **Print v3 toggle:** Confirm the Poster Grid offers Compact vs One per page in the toolbar, and the toggle is hidden in print output. (`/t/:id/final/v3`)

## Manual UPI payment QA
1. Navigate to `/t/:id/upgrade` for a tournament.
2. Pay via UPI QR and note the UTR.
3. Submit the UTR in the upgrade form.
4. Confirm the payment appears as "Pending" with auto-polling (10-second intervals).
5. As master, go to `/master-dashboard` → Payment Approvals → approve the claim.
6. Confirm the organizer sees "PRO active" status and the tournament has full access.
7. Verify: `SELECT * FROM tournament_payments WHERE tournament_id = '<id>' ORDER BY created_at DESC LIMIT 1;`

## Profile completion reward QA
1. Navigate to `/account`.
2. Fill all 5 fields (display_name, phone, city, org_name, fide_arbiter_id).
3. Confirm the completion meter shows 100%.
4. Click "Claim Reward" and confirm a success toast.
5. Verify coupon exists: `SELECT code, origin FROM coupons WHERE origin = 'profile_reward' AND issued_to_user_id = '<user_id>';`
6. Confirm the reward cannot be claimed twice.

## Referral cross-device QA
1. Generate a referral code on `/account` → copy the share link.
2. Open the share link in a different browser/device.
3. Sign up with a new email.
4. Confirm email on the original or a third device.
5. Log in and verify the referral was captured: check `/account` on the referrer's side for the new referee.
6. Debug: add `?debug_referrals=1` to the referee's URL and check console for `[referral-hook]` logs.
7. Verify: `SELECT * FROM referrals WHERE referrer_id = '<referrer_user_id>' ORDER BY created_at DESC LIMIT 5;`

## Admin coupons QA (filters + drilldown)
1. Log in as master → navigate to `/admin/coupons`.
2. Verify filters: toggle between All/Global/Targeted scope and All/Admin/System source.
3. Search for `PROFILE-` prefix → confirm profile reward coupons appear with correct origin badge.
4. Search for `REF1-` prefix → confirm referral coupons appear.
5. Click a coupon row to open drilldown → verify origin-specific context is shown (referral level, trigger user for referral coupons).

## Admin martech QA (click bars → drilldown rows)
1. Log in as master → navigate to `/admin/martech`.
2. Confirm all funnel charts load (organizer, tournament, payment, profile, referral).
3. Click a bar in the referral funnel → verify drilldown panel opens with referral records.
4. Click a bar in the payment funnel → verify drilldown panel opens with payment records.
5. Click a bar in the profile funnel → verify drilldown panel opens with profile records.
