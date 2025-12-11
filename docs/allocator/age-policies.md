# Age Band Policies

Prize-Manager supports two age band policies controlled by `age_band_policy` on each tournament or rule configuration.

## Policy options

| Value | Default usage | How ranges work | Example with U8/U11/U14/U17 |
|-------|---------------|-----------------|-----------------------------|
| `non_overlapping` | **Default for new tournaments** | Adjacent, non-overlapping bands derived from configured max ages. Categories sharing the same `max_age` (e.g., U8 Boy + U8 Girl) get identical bands. Effective min ages are clamped so you never see `effective_min_age > effective_max_age`. | [0–8], [9–11], [12–14], [15–17]. A 10-year-old is only considered for **U11**. |
| `overlapping` | Legacy compatibility (kept for migrated tournaments) | Each Under-X is an independent [min_age, max_age] filter | With max ages 8/11/14/17, a 10-year-old is eligible for **U11, U14, and U17**. |

**UI toggle:** In **Edit Rules → Age Band Policy**, tournament directors can switch between these modes. New tournaments start on `non_overlapping`. Existing tournaments keep `overlapping` so historical allocations remain unchanged until the TD explicitly switches.

## Implementation notes

- **Boy/Girl pairs share bands:** When multiple categories share the same `max_age` (e.g., "Under 8 Boy" and "Under 8 Girl" both with `max_age: 8`), the allocator groups them before deriving effective age bands. Both categories get the same band (e.g., `[0, 8]`).
- **Clamped mins:** If a category accidentally sets `min_age` higher than its `max_age`, the allocator clamps the effective minimum down to the max so no band is ever inverted.

### Sample mapping (non-overlapping)
- U8 Boy + U8 Girl (`max_age: 8`) → `[0–8]`
- U11 Boy + U11 Girl (`max_age: 11`) → `[9–11]`
- U14 Boy + U14 Girl (`max_age: 14`) → `[12–14]`
- U17 Boy + U17 Girl (`max_age: 17`) → `[15–17]`

## Practical guidance

- Use **non-overlapping** for the usual "one age band per child" experience (recommended).
- Use **overlapping** only when you intentionally want cascading eligibility across multiple Under-X bands.
- Age is still calculated on the tournament start date; the policy only changes which category ranges are considered.
