# Prize Priority Hierarchy

When a player qualifies for multiple prizes, the allocation algorithm must decide which prize they receive (since each player can only win one prize). This document describes the hierarchy used.

## Priority Order (highest to lowest)

| Priority | Field | Direction | Description |
|----------|-------|-----------|-------------|
| **1** | Cash Amount | Higher wins | ₹1000 beats ₹500 |
| **2** | Prize Type | Trophy > Medal > None | Trophy (+3) beats Medal (+2) beats Certificate/None (+0) |
| **3** | Main Category | Main > Subcategory | Main prizes are more prestigious |
| **4** | Place Number | Lower wins | 1st place beats 2nd place |
| **5** | Category Order | Lower wins | Earlier in brochure = higher priority |
| **6** | Prize ID | Alphabetical | Stable tie-breaker for determinism |

## Examples

### Example 1: Cash is King
- **Prize A**: ₹1000 cash, medal, subcategory
- **Prize B**: ₹500 cash, trophy, main category

**Winner**: Prize A (higher cash wins regardless of other factors)

### Example 2: Trophy vs Medal (equal cash)
- **Prize A**: ₹500 cash, medal, main category, 1st place
- **Prize B**: ₹500 cash, trophy, subcategory, 1st place

**Winner**: Prize B (trophy beats medal when cash is equal)

### Example 3: Main vs Subcategory (equal cash & type)
- **Prize A**: ₹500 cash, trophy, main category, 2nd place
- **Prize B**: ₹500 cash, trophy, subcategory, 1st place

**Winner**: Prize A (main category beats subcategory when cash and type are equal)

### Example 4: Place Number (all else equal)
- **Prize A**: ₹500 cash, trophy, main category, 1st place
- **Prize B**: ₹500 cash, trophy, main category, 2nd place

**Winner**: Prize A (1st place beats 2nd place)

## Debug Output

The allocation debug report now includes a `priority_explanation` field for each prize showing its priority factors:

```
priority_explanation: "cash=₹1000, type=trophy, main=yes, place=1, order=0"
```

## Implementation

The hierarchy is implemented in `supabase/functions/allocatePrizes/index.ts`:

- `getPrizeTypeScore(prize)` - Returns 3 (trophy), 2 (medal), or 0 (none)
- `prizeKey(category, prize)` - Computes the composite sorting key
- `cmpPrize(a, b)` - Comparator function implementing the hierarchy

## Testing

See `tests/allocation/prize-priority.spec.ts` for comprehensive tests covering:
- Each tier of the hierarchy
- Edge cases with equal values
- Trophy vs medal scenarios
- Full hierarchy sorting
