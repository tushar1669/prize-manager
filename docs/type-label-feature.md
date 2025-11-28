# Type Label Feature

## Overview

The `type_label` field enables generic category-based eligibility using the **Type** column from Swiss-Manager ranking exports. This is completely independent from the `group_label` (Gr column) feature.

## Database Schema

```sql
-- players table
type_label text  -- Generic category label from Swiss-Manager Type column (PC, S60, F14, etc.)
```

## Import Pipeline

### Source
- Swiss-Manager exports often include a "Type" column with values like:
  - `PC` - Physically Challenged
  - `S60` - Senior 60+
  - `F14` - Female Under 14
  - `U15` - Under 15
  - `Section A`, `Section B` - Custom section labels

### Processing
1. **Header Aliases**: `type: ['type']` in `headerAliases.ts`
2. **Normalization**: `normalizeTypeColumn(raw)` in `valueNormalizers.ts`
   - Trims whitespace
   - Preserves original case for display
   - Returns `null` for empty/whitespace-only values
3. **Payload**: `buildSupabasePlayerPayload()` populates `type_label`

### Key Difference from Gr Column
- **Type is purely generic** - no special handling for "PC" or any other value
- **Gr still has PC compatibility** - setting `disability='PC'` for backward compatibility
- **Both can be used independently** or combined in the same category rules

## Allocator Behavior

### Criteria Field
```json
{
  "allowed_types": ["PC", "S60", "F14"]
}
```

### Eligibility Rules
1. If `allowed_types` is empty/undefined → Type dimension is ignored
2. If `allowed_types` has values → Player's `type_label` must match one (case-insensitive)
3. Type check is **AND** with all other criteria (age, rating, group, etc.)

### Reason Codes
- `type_ok` - Player's type matched an allowed type
- `type_excluded` - Player's type did not match any allowed type

## UI: Edit Rules Sheet

Located in `TournamentSetup.tsx`, the "Type (Type column from Swiss-Manager)" field:
- Accepts comma-separated type values
- Saves to `criteria.allowed_types` as `string[]`
- Help text explains the field's purpose

## Example Configurations

### 1. Best PC (Type)
```json
{
  "allowed_types": ["PC"]
}
```
Players with `type_label = 'PC'` are eligible.

### 2. Best S60 (Type + Age)
```json
{
  "allowed_types": ["S60"],
  "min_age": 60
}
```
Players must have `type_label = 'S60'` AND be 60+ years old.

### 3. Best Raipur S60 (Group + Type)
```json
{
  "allowed_groups": ["Raipur"],
  "allowed_types": ["S60"]
}
```
Players must have `group_label = 'Raipur'` AND `type_label = 'S60'`.

### 4. Multiple Types
```json
{
  "allowed_types": ["PC", "S60"]
}
```
Players with either `PC` or `S60` type are eligible.

## Testing

Tests are located in `tests/allocation/allocation.spec.ts`:
- Type-only category filtering
- Type + age composition
- Type + group composition
- Multiple allowed types
- Case-insensitive matching
- Normalizer unit tests

## Comparison: Group vs Type vs Disability

| Feature | Field | Source Column | Special Handling |
|---------|-------|---------------|------------------|
| Group | `group_label` | Gr | PC → sets `disability='PC'` too |
| Type | `type_label` | Type | None (purely generic) |
| Disability | `disability` | Gr (if PC) | Legacy field |

## Migration Notes

The feature was added via migration that:
1. Added `type_label text` column to `players`
2. Updated `import_replace_players()` function to include `type_label`

No data migration is needed for existing tournaments - they will simply have `type_label = null` until re-imported.
