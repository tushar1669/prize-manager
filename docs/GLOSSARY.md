# Glossary

Concise UI and workflow terms used across import/review/finalize/public pages.

- **Preview Allocation**: Review-stage allocation run before commit/publish (`/t/:id/review`).
- **Conflict Review**: Page where preview winners/conflicts/unfilled diagnostics are reviewed (`src/pages/ConflictReview.tsx`).
- **Coverage**: Broad allocation export/report used for full audit context (`src/utils/allocationCoverageExport.ts`).
- **RCA (Root Cause Analysis)**: Focused export for unfilled prize causes (`src/utils/allocationRcaExport.ts`).
- **Unfilled**: Prize with no allocated winner after preview.
- **Diagnosis Summary**: Review diagnostics explaining conflicts/eligibility/unfilled outcomes.
- **Finalize**: Step that persists allocation decisions before public publishing (`/t/:id/finalize`).
- **Publish**: Action that makes tournament outputs visible in public surfaces (`/t/:id/publish`).
- **Main vs Side**: Priority mode influencing main-prize ordering behavior (see settings docs and allocator behavior).
- **One-prize policy / multi-prize policy**: Whether a player can receive only one prize or multiple (individual allocator configuration).
- **Public tournament page**: Viewer-facing routes (`/public`, `/p/:slug`, `/p/:slug/results`).
- **Master user**: Elevated role required for protected admin/master routes (`/master-dashboard`, `/admin/tournaments`).

- **Referral code**: Unique shareable code (`REF-XXXX`) generated per organizer via `/account`. Used in signup links to track referrer→referee relationships.
- **Referrer**: The organizer who shares their referral code to invite new users.
- **Referee (referred user)**: The organizer who signs up using another organizer's referral link.
- **Referral reward**: A discount coupon automatically issued to the referrer (and upstream chain) when a referee upgrades to Pro. See [Referrals & Rewards](./REFERRALS_AND_REWARDS.md).
- **pending_referral_code**: Field stored in Supabase Auth `user_metadata` during signup to ensure cross-device referral capture.
- **Coupon origin**: Machine-readable tag on `coupons.origin` indicating how the coupon was created (`profile_reward`, `referral_l1`, `referral_l2`, `referral_l3`, or null for admin-created).
- **Profile reward**: One-time Pro discount coupon (`PROFILE-` prefix) earned by completing all profile fields on `/account`.
- **Entitlement**: A `tournament_entitlements` record granting Pro access to a specific tournament, with source and validity window.
- **Targeted coupon**: A coupon issued to a specific user (`issued_to_user_id` / `issued_to_email` set). Contrasts with global coupons usable by anyone.
- **Global coupon**: A coupon with no `issued_to_user_id` / `issued_to_email`, redeemable by any eligible user.

If a term appears in UI but is not listed here, treat definition as **UNKNOWN** and verify in component text under `src/pages/*` and `src/components/*`.
