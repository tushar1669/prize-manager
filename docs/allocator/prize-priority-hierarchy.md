# Prize Priority Hierarchy

When a player qualifies for multiple prizes, the allocation algorithm must decide which prize they receive (since each player can only win one prize). This document describes the hierarchy used.

## Priority Order (Configurable)

The priority hierarchy depends on the **"Prefer Main on Equal Value"** toggle in Tournament Settings.

### Toggle OFF (default): Place Before Main

When the toggle is **OFF**, place number is compared before Main vs Subcategory:

| Priority | Field | Direction | Description |
|----------|-------|-----------|-------------|
| **1** | Cash Amount | Higher wins | ₹1000 beats ₹500 |
| **2** | Prize Type | Trophy > Medal > None | Trophy (+3) beats Medal (+2) beats Certificate/None (+0) |
| **3** | Place Number | Lower wins | 1st place beats 2nd place, **even across categories** |
| **4** | Main Category | Main > Subcategory | Main prizes preferred when cash, type, **and place** are equal |
| **5** | Category Order (brochure) | Lower wins | Earlier in brochure = higher priority |
| **6** | Prize ID | Alphabetical | Stable tie-breaker for determinism |

**Use case**: Player prefers the prize where their placing is better, regardless of category type. "I'd rather be 1st in something than 8th in Main."

### Toggle ON: Main First

When the toggle is **ON**, Main beats Side immediately after cash/type (before place):

| Priority | Field | Direction | Description |
|----------|-------|-----------|-------------|
| **1** | Cash Amount | Higher wins | ₹1000 beats ₹500 |
| **2** | Prize Type | Trophy > Medal > None | Trophy (+3) beats Medal (+2) beats Certificate/None (+0) |
| **3** | Main vs Side | Main wins | When comparing Main vs Side, Main always wins at equal cash/type |
| **4** | Place Number | Lower wins | 1st place beats 2nd place |
| **5** | Category Order (brochure) | Lower wins | Earlier in brochure = higher priority |
| **6** | Prize ID | Alphabetical | Stable tie-breaker for determinism |

**Important**: This ONLY applies when comparing Main vs Side. Side vs Side comparisons still use place before category order.

**Use case**: Tournaments that want Main category prestige to outweigh placement. "Any Main prize is better than any Side prize."

## Key Scenarios

### Example 1: Cash is King (both modes)
- **Prize A**: ₹1000 cash, medal, subcategory
- **Prize B**: ₹500 cash, trophy, main category

**Winner**: Prize A (higher cash wins regardless of other factors)

### Example 2: Trophy vs Medal (both modes)
- **Prize A**: ₹500 cash, medal, main category, 1st place
- **Prize B**: ₹500 cash, trophy, subcategory, 1st place

**Winner**: Prize B (trophy beats medal when cash is equal)

### Example 3: Main 4th vs Side 1st (₹8k+trophy each)

**Toggle OFF** (default): Side 1st wins (1st place beats 4th place)

**Toggle ON**: Main 4th wins (Main category prestige wins)

### Example 4: Side vs Side (₹5k+trophy each)
- **Prize A**: Rating Band A, 1st place, order_idx=1
- **Prize B**: Rating Band B, 2nd place, order_idx=0

**Winner (both modes)**: Prize A (1st place beats 2nd place)

The toggle ONLY affects Main vs Side comparisons; Side vs Side always uses place first.

### Example 5: Main vs Main (₹5k+trophy each)
- **Prize A**: Main, 2nd place
- **Prize B**: Main, 5th place

**Winner (both modes)**: Prize A (2nd place beats 5th place)

When both prizes are Main, place is always compared normally.

## Debug Output

The allocation debug report includes a `priority_explanation` field for each prize:

**Toggle OFF**:
```
priority_explanation: "cash=₹1000, type=trophy, place=1, main=yes, order=0"
```

**Toggle ON**:
```
priority_explanation: "cash=₹1000, type=trophy, main=yes (priority), place=1, order=0"
```

## Implementation

The hierarchy is implemented in `supabase/functions/allocatePrizes/index.ts`:

- `getPrizeTypeScore(prize)` - Returns 3 (trophy), 2 (medal), or 0 (none)
- `prizeKey(category, prize)` - Computes the composite sorting key
- `makePrizeComparator(opts)` - Factory that creates comparator with toggle support
- `cmpPrize` - Default comparator (toggle OFF) for backward compatibility

### Comparator Logic (simplified)

```typescript
// Factory creates comparator based on prefer_main_on_equal_value setting
export const makePrizeComparator = (opts: { prefer_main_on_equal_value?: boolean }) => {
  const preferMainFirst = opts.prefer_main_on_equal_value ?? false;
  
  return (a, b) => {
    // 1. Cash amount: higher wins
    if (ak.cash !== bk.cash) return bk.cash - ak.cash;

    // 2. Prize type: trophy > medal > none
    if (ak.prizeTypeScore !== bk.prizeTypeScore) return bk.prizeTypeScore - ak.prizeTypeScore;

    // 3. Conditional: If preferMainFirst AND comparing Main vs Side, Main wins
    const isMainVsSide = ak.main !== bk.main;
    if (preferMainFirst && isMainVsSide) {
      return bk.main - ak.main; // Main wins
    }

    // 4. Place number: 1st > 2nd > 3rd
    if (ak.place !== bk.place) return ak.place - bk.place;
    
    // 5. Main category preferred (fallback for same-place)
    if (ak.main !== bk.main) return bk.main - ak.main;
    
    // 6. Category brochure order
    if (ak.order !== bk.order) return ak.order - bk.order;
    
    // 7. Stable tie-breaker by prize ID
    return String(ak.pid).localeCompare(String(bk.pid));
  };
};
```

## Testing

See `tests/allocation/prize-priority.spec.ts` for comprehensive tests covering:
- Each tier of the hierarchy
- Toggle OFF: Side 1st beats Main 4th
- Toggle ON: Main 4th beats Side 1st
- Side vs Side unchanged (place first in both modes)
- Main vs Main unchanged (place first in both modes)
- Full hierarchy sorting
