# Prize Value Ordering with Gifts

This document defines how prize value ordering works after adding gift bundles.

## Ordering rules

When comparing two prizes for the same player:

1. **Cash amount first (DESC)**
   - Higher `cash_amount` always wins.
2. **Non-cash bundle next (lexicographic DESC)**
   - Components are binary for now: `T` (Trophy), `G` (Gift present), `M` (Medal).
   - Comparison order comes from `rule_config.non_cash_priority_mode`.
3. **Existing tie-breakers**
   - If still tied after cash + bundle, existing tie-breakers apply unchanged:
     - `main_vs_side_priority_mode`
     - place
     - category order
     - stable prize id

## Priority modes

`non_cash_priority_mode` supports all 6 permutations:

- `TGM` = Trophy > Gift > Medal
- `TMG` = Trophy > Medal > Gift
- `GTM` = Gift > Trophy > Medal
- `GMT` = Gift > Medal > Trophy
- `MTG` = Medal > Trophy > Gift
- `MGT` = Medal > Gift > Trophy

Default mode is `TGM`.

## Gift presence

Gift is currently **presence-based**:

- Gift bit is `1` when `jsonb_array_length(gift_items) > 0`
- Gift bit is `0` when `gift_items` is empty

## Why the setting appears only when gifts exist

To reduce UI noise and keep legacy tournaments simple, the "Non-cash prize priority" setting is shown only when at least one **active** prize has non-empty `gift_items`.

This keeps behavior intuitive:

- No gifts configured → gift priority control is hidden
- Gifts configured → organizer can adjust Trophy/Gift/Medal ordering explicitly
