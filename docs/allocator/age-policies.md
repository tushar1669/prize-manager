# Age Band Policies

Prize-Manager supports two age band policies controlled by `age_band_policy` on each tournament or rule configuration.

## Policy options

| Value | Default usage | How ranges work | Example with U8/U11/U14/U17 |
|-------|---------------|-----------------|-----------------------------|
| `non_overlapping` | **Default for new tournaments** | Adjacent, non-overlapping bands derived from configured max ages. Categories sharing the same `max_age` (e.g., U8 Boy + U8 Girl) get identical bands. | [0–8], [9–11], [12–14], [15–17]. A 10-year-old is only considered for **U11**. |
| `overlapping` | Legacy compatibility (kept for migrated tournaments) | Each Under-X is an independent [min_age, max_age] filter | With max ages 8/11/14/17, a 10-year-old is eligible for **U11, U14, and U17**. |

**UI toggle:** In **Edit Rules → Age Band Policy**, tournament directors can switch between these modes. New tournaments start on `non_overlapping`. Existing tournaments keep `overlapping` so historical allocations remain unchanged until the TD explicitly switches.

## Implementation note (Boy/Girl pairs)

When multiple categories share the same `max_age` (e.g., "Under 8 Boy" and "Under 8 Girl" both with `max_age: 8`), the allocator **groups them together** before deriving effective age bands. This ensures both categories get the same valid band (e.g., `[0, 8]`) instead of one getting an invalid reversed band.

## Practical guidance

- Use **non-overlapping** for the usual "one age band per child" experience (recommended).
- Use **overlapping** only when you intentionally want cascading eligibility across multiple Under-X bands.
- Age is still calculated on the tournament start date; the policy only changes which category ranges are considered.
