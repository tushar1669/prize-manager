# Key User Flows

Canonical operator flow for individual prize workflows:

## 1) Import players
- **Route:** `/t/:id/import`
- **Primary actions:** upload Swiss-Manager XLS/XLSX, map columns, resolve conflicts, save players.
- **Artifacts:** imported players, optional conflict export, import quality signals.
- **Where implemented:** `src/pages/PlayerImport.tsx`.
- **Failure checkpoint:** if column mapping/validation fails, inspect import schema + dedup signals in `src/utils/importSchema.ts` and `src/utils/dedup.ts`.

## 2) Preview allocation
- **Route:** `/t/:id/review`
- **Primary actions:** run preview allocation, inspect winners/conflicts/unfilled rows.
- **Artifacts:** preview winners + coverage + unfilled diagnostics returned from `allocatePrizes`.
- **Where implemented:** `src/pages/ConflictReview.tsx`, `supabase/functions/allocatePrizes/index.ts`.
- **Failure checkpoint:** if preview fails, verify edge function health and auth/session; see `docs/TROUBLESHOOTING.md`.

## 3) Debug and diagnose
- **Route:** `/t/:id/review`
- **Primary actions:** inspect coverage entries and critical/unfilled diagnosis.
- **Artifacts:** coverage table + diagnosis summaries in review UI.
- **Where implemented:** `src/pages/ConflictReview.tsx`.
- **Failure checkpoint:** if results look wrong, export both coverage and RCA and compare with category/prize settings.

## 4) Export diagnostics (Coverage vs RCA)
- **Route:** `/t/:id/review`
- **Primary actions:** export Coverage report and RCA report.
- **Artifacts:** XLSX files generated from:
  - `src/utils/allocationCoverageExport.ts`
  - `src/utils/allocationRcaExport.ts`
- **Failure checkpoint:** if export is empty, verify preview was completed and that unfilled RCA rows exist.

## 5) Finalize and publish
- **Routes:** `/t/:id/finalize` -> `/t/:id/publish`
- **Primary actions:** finalize allocations, publish tournament, verify public URL.
- **Artifacts:** persisted finalized allocations + publication version.
- **Where implemented:** `src/pages/Finalize.tsx`, `supabase/functions/finalize/index.ts`, `src/pages/PublishSuccess.tsx`.
- **Failure checkpoint:** if publish fails, inspect RPC/update errors in finalize logs and confirm public pages query only published records.

## 6) Referral signup and reward
- **Route:** `/auth?mode=signup&ref=REF-XXXX` → `/auth/callback` → `/account`
- **Primary actions:** sign up with referral code, confirm email (possibly cross-device), referral captured by global hook.
- **Artifacts:** `referrals` row linking referrer → referee; `referral_rewards` + `coupons` rows after referee upgrades.
- **Where implemented:** `src/pages/Auth.tsx` (signup with metadata), `src/hooks/useApplyPendingReferral.ts` (global capture), `src/pages/Account.tsx` (visibility).
- **Failure checkpoint:** use `?debug_referrals=1` to trace capture; see [Troubleshooting](./TROUBLESHOOTING.md) playbook #6.

## 7) Tournament upgrade via coupon
- **Route:** `/t/:id/upgrade`
- **Primary actions:** enter coupon code → `apply_coupon_for_tournament` validates → `redeem_coupon_for_tournament` creates entitlement.
- **Artifacts:** `coupon_redemptions` row, `tournament_entitlements` row, referral rewards triggered for the chain.
- **Where implemented:** `src/pages/TournamentUpgrade.tsx`.
- **Failure checkpoint:** if coupon is rejected, check coupon validity (active, not expired, not fully redeemed).

## 8) Tournament upgrade via UPI
- **Route:** `/t/:id/upgrade` → `/master-dashboard`
- **Primary actions:** organizer pays via UPI, submits UTR → master reviews in Payment Approvals panel.
- **Artifacts:** `tournament_payments` row (pending → approved), `tournament_entitlements` row, referral rewards triggered.
- **Where implemented:** `src/pages/TournamentUpgrade.tsx` (submit), `src/components/master/PendingPaymentsPanel.tsx` (review), `review_tournament_payment` RPC.
- **Failure checkpoint:** if approval fails, check RPC errors in master dashboard console; verify tournament ownership.

## 9) Profile completion reward
- **Route:** `/account`
- **Primary actions:** fill all 5 profile fields → click "Claim Reward".
- **Artifacts:** `coupons` row with origin `profile_reward`, `profiles.profile_reward_claimed = true`.
- **Where implemented:** `src/pages/Account.tsx`, `claim_profile_completion_reward` RPC.
- **Failure checkpoint:** if claim fails, verify all 5 fields are non-empty and `profile_reward_claimed` is still false.

## Related docs
- [User Guide](./USER_GUIDE.md)
- [Referrals and Rewards](./REFERRALS_AND_REWARDS.md)
- [Coupons Lifecycle](./COUPONS_LIFECYCLE.md)
- [Exports Coverage vs RCA](./EXPORTS_COVERAGE_VS_RCA.md)
- [Glossary](./GLOSSARY.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
