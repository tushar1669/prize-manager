# Prize Priority Hierarchy

When a player qualifies for multiple prizes, the allocation algorithm must decide which prize they receive (since each player can only win one prize). This document describes the hierarchy used.

## Priority Order (highest to lowest)

Global ordering is preserved. Within that ordering, the comparator now evaluates prizes using the following hierarchy:

| Priority | Field | Direction | Description |
|----------|-------|-----------|-------------|
| **1** | Cash Amount | Higher wins | ₹1000 beats ₹500 |
| **2** | Prize Type | Trophy > Medal > None | Trophy (+3) beats Medal (+2) beats Certificate/None (+0) |
| **3** | Place Number | Lower wins | 1st place beats 2nd place, **even across categories** |
| **4** | Main Category | Main > Subcategory | Main prizes preferred when cash, type, **and place** are equal |
| **5** | Category Order (brochure) | Lower wins | Earlier in brochure = higher priority |
| **6** | Prize ID | Alphabetical | Stable tie-breaker for determinism |

## Key Change: Place Before Main

The hierarchy prioritizes **place number before main vs subcategory**. This means:

- A **1st place** prize in a subcategory beats a **2nd place** prize in the Main category (when cash and trophy/medal are equal)
- The player gets the prize where their placing is better, regardless of which category it's in

This is more intuitive: "I'd rather be 1st in something than 8th in Main."

## Examples

### Example 1: Cash is King
- **Prize A**: ₹1000 cash, medal, subcategory
- **Prize B**: ₹500 cash, trophy, main category

**Winner**: Prize A (higher cash wins regardless of other factors)

### Example 2: Trophy vs Medal (equal cash)
- **Prize A**: ₹500 cash, medal, main category, 1st place
- **Prize B**: ₹500 cash, trophy, subcategory, 1st place

**Winner**: Prize B (trophy beats medal when cash is equal)

### Example 3: Better Place Wins (equal cash & type)
- **Prize A**: ₹8500 cash, trophy, main category, 8th place
- **Prize B**: ₹8500 cash, trophy, subcategory (rating band), 1st place

**Winner**: Prize B (1st place beats 8th place, even though A is Main category)

**Concrete tie-break example:** Main 8th vs Rating 1st with equal cash and trophy → **Rating 1st wins** because 1st place outranks 8th place.

### Example 4: Main 6th vs Rating 7th (equal cash & type)
- **Prize A**: ₹8500 cash, trophy, main category, 6th place
- **Prize B**: ₹8500 cash, trophy, subcategory, 7th place

**Winner**: Prize A (6th place beats 7th place)

### Example 5: Main vs Subcategory (same place)
- **Prize A**: ₹500 cash, trophy, main category, 1st place
- **Prize B**: ₹500 cash, trophy, subcategory, 1st place

**Winner**: Prize A (when place is equal, main category wins)

## Debug Output

The allocation debug report includes a `priority_explanation` field for each prize showing its priority factors:

```
priority_explanation: "cash=₹1000, type=trophy, place=1, main=yes, order=0"
```

## Implementation

The hierarchy is implemented in `supabase/functions/allocatePrizes/index.ts`:

- `getPrizeTypeScore(prize)` - Returns 3 (trophy), 2 (medal), or 0 (none)
- `prizeKey(category, prize)` - Computes the composite sorting key
- `cmpPrize(a, b)` - Comparator function implementing the hierarchy

### Comparator Order (code reference)

```typescript
// 1. Cash amount: higher wins
if (ak.cash !== bk.cash) return bk.cash - ak.cash;

// 2. Prize type: trophy > medal > none
if (ak.prizeTypeScore !== bk.prizeTypeScore) return bk.prizeTypeScore - ak.prizeTypeScore;

// 3. Place number: 1st > 2nd > 3rd (BEFORE main)
if (ak.place !== bk.place) return ak.place - bk.place;

// 4. Main category preferred (when cash, type, AND place are equal)
if (ak.main !== bk.main) return bk.main - ak.main;

// 5. Category brochure order (global prize ordering)
if (ak.order !== bk.order) return ak.order - bk.order;

// 6. Stable tie-breaker by prize ID
return String(ak.pid).localeCompare(String(bk.pid));
```

## Testing

See `tests/allocation/prize-priority.spec.ts` for comprehensive tests covering:
- Each tier of the hierarchy
- Edge cases with equal values
- Trophy vs medal scenarios
- **Place before Main** scenarios (Main 8th vs Rating 1st, etc.)
- Full hierarchy sorting
