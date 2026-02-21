# Coupons Lifecycle (Canonical Spec)

## Core identities
- **`issued_to`**: the intended recipient identity at issuance time (user/account/player id depending on coupon type).
- **`redeemed_by`**: the actor identity that actually redeemed the coupon.
- `issued_to` and `redeemed_by` can differ only when policy explicitly allows transfer/delegation.

## Lifecycle states
- **`created`**: coupon record exists but has not been assigned.
- **`issued`**: coupon assigned to `issued_to`, with issuance timestamp and policy constraints.
- **`redeemed`**: coupon consumed by `redeemed_by`; redemption is immutable and idempotent.
- **`expired`**: coupon passed validity window and can no longer be redeemed.
- **`voided`**: coupon manually invalidated by an authorized admin flow.

Allowed transitions:
- `created -> issued`
- `issued -> redeemed`
- `issued -> expired`
- `issued -> voided`

Terminal states: `redeemed`, `expired`, `voided`.

## Analytics metrics
Track these metrics per campaign, tournament, and time window:
- **Issued count**: total moved into `issued`.
- **Redeemed count**: total moved into `redeemed`.
- **Redemption rate**: `redeemed / issued`.
- **Expiry rate**: `expired / issued`.
- **Void rate**: `voided / issued`.
- **Issue-to-redeem latency**: median/P95 elapsed time from issued to redeemed.
- **Unique redeemers**: count distinct `redeemed_by`.
- **Mismatch rate**: percent where `issued_to != redeemed_by` (only valid for transfer-enabled policies).

## Security and abuse prevention
- Enforce authorization server-side for issue, void, and redeem operations.
- Treat coupon redemption as idempotent and atomic to prevent double-spend races.
- Validate ownership rules for `issued_to`/`redeemed_by` before state transition.
- Require short-lived, signed redemption intents or one-time tokens for client-triggered redemption.
- Apply rate limits and anomaly detection on redeem attempts (per identity, IP/device, coupon).
- Store audit events for each transition (`who`, `when`, `from_state`, `to_state`, `reason`).
- Never log PII in operational logs; use internal IDs and aggregate counts only.

## Coupon origins and prefixes

Each coupon has an `origin` field indicating how it was created:

| `origin` value | Meaning | Code prefix | Created by |
|----------------|---------|-------------|------------|
| `null` / blank | Admin-created (manual) | Any | `admin_create_coupon` RPC |
| `profile_reward` | Profile completion reward | `PROFILE-` | `claim_profile_completion_reward` RPC |
| `referral_l1` | Level 1 referral reward (100% discount) | `REF1-` | `issue_referral_rewards` RPC |
| `referral_l2` | Level 2 referral reward (50% discount) | `REF2-` | `issue_referral_rewards` RPC |
| `referral_l3` | Level 3 referral reward (25% discount) | `REF3-` | `issue_referral_rewards` RPC |

## Where coupons appear

- **`/account`**: Organizers see their earned coupons (profile reward, referral rewards) and can copy codes for use during tournament upgrade.
- **`/admin/coupons`**: Master admins see all coupons with source badges (Admin / System), filter by scope (Global / Targeted), and drill down into origin-specific context (referral level, trigger user, tournament).
- **Tournament upgrade page** (`/t/:id/upgrade`): Organizers apply coupon codes to reduce the Pro upgrade fee.

## Key fields

- **`issued_to_user_id`**: The user the coupon is targeted to (null for global coupons).
- **`issued_to_email`**: Snapshot of the target user's email at issuance time (for admin display; not used for authorization).
- **`origin`**: How the coupon was created (see table above).
- **`meta`**: JSON field for additional context (present on redemption records).

## How referral and profile coupons are issued

### Profile completion reward
1. Organizer fills all 5 profile fields (display_name, phone, city, org_name, fide_arbiter_id).
2. `profile_completed_at` timestamp is set.
3. Organizer clicks "Claim Reward" → calls `claim_profile_completion_reward` RPC.
4. RPC creates one targeted coupon with origin `profile_reward` and sets `profile_reward_claimed = true`.

### Referral rewards
Referral rewards are issued automatically when a referred organizer upgrades to Pro:
1. **Manual UPI payment approved**: `review_tournament_payment` RPC approves payment → creates entitlement → calls `issue_referral_rewards`.
2. **100% coupon upgrade**: When a coupon covers the full amount, `redeem_coupon_for_tournament` triggers reward issuance.
3. `issue_referral_rewards` walks the referral chain (up to 3 levels) and creates L1/L2/L3 coupons for each beneficiary.

## Verification SQL (read-only)

```sql
-- Coupons by origin
SELECT code, origin, discount_value, issued_to_email, is_active, created_at
FROM coupons
WHERE origin IS NOT NULL
ORDER BY created_at DESC
LIMIT 30;

-- Redemption history
SELECT cr.id, c.code, c.origin, cr.discount_amount, cr.redeemed_at, cr.tournament_id
FROM coupon_redemptions cr
JOIN coupons c ON c.id = cr.coupon_id
ORDER BY cr.redeemed_at DESC
LIMIT 20;
```

## Related docs
- [Referrals and Rewards](./REFERRALS_AND_REWARDS.md) — 3-level reward system, cross-device capture
- [Security & Access Control](./SECURITY_ACCESS_CONTROL.md) — RLS policies for coupon tables
- [Troubleshooting](./TROUBLESHOOTING.md) — coupon visibility issues
