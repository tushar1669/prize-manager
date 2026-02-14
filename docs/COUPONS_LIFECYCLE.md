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
