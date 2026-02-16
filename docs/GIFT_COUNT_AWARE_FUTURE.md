# Future extension: gift count-aware value comparison

Current behavior is intentionally simple:

- Gift contributes a binary component: present (`1`) or absent (`0`).
- Gift quantity and gift type do not affect ordering.

## Potential future design (not implemented)

If organizers later need richer gift valuation, we can extend comparison in a backward-compatible way:

1. Keep current primary keys intact:
   - cash DESC
   - component priority mode
2. Add optional secondary gift scoring **inside the Gift component tie**:
   - total quantity (`sum(qty)`)
   - weighted item scoring (per item catalog)
   - max-item score
3. Gate enhanced behavior behind an explicit new config flag so existing tournaments do not change unexpectedly.

## Migration compatibility notes

- `gift_items` should remain JSON array-based.
- Presence-based behavior can remain default fallback.
- Any qty-aware mode should be additive and opt-in.
