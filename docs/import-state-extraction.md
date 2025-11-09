# Auto-Extraction of State Codes from Ident Column

## Overview

The Prize-Manager import pipeline now automatically extracts 2-letter state codes from the Swiss-Manager `Ident` column when the `state` field is missing or empty.

This enhancement eliminates the need for manual state mapping when importing Swiss-Manager files that contain player identifiers in the format: `IND/KA/10203`.

## How It Works

### 1. Column Recognition

The `Ident` column is automatically detected and mapped during import using these aliases:
- `ident`
- `Ident`
- `player-id`
- `player_id`
- `pid`
- `id_no`

### 2. State Extraction Logic

After column mapping is confirmed, the system:

1. **Checks if state is missing**: If the `state` field is `null`, `undefined`, or empty string
2. **Locates Ident value**: Searches for the Ident column in mapped data or raw row data
3. **Extracts state code**: Parses the Ident value using the `extractStateFromIdent()` function
4. **Validates format**: Ensures extracted code is exactly 2 uppercase letters
5. **Assigns state**: Populates the `state` field with the extracted code
6. **Marks auto-extracted**: Sets `_stateAutoExtracted = true` for tracking

### 3. Extraction Algorithm

The `extractStateFromIdent()` function in `src/utils/importSchema.ts` implements this logic:

```typescript
/**
 * Extract 2-letter state code from Swiss-Manager Ident column
 * Ident format: IND/STATE/NNNN or similar patterns
 * Examples: "IND/KA/10203" → "KA", "IND/MH/1234" → "MH"
 */
export function extractStateFromIdent(ident?: string | null): string | null {
  if (!ident) return null;
  
  const str = String(ident).trim();
  const parts = str.split('/');
  
  // Expect format like: IND/KA/NNNN or IND/MH/CODE
  if (parts.length >= 2) {
    const stateCandidate = parts[1].trim().toUpperCase();
    // Valid if 2 uppercase letters
    if (/^[A-Z]{2}$/.test(stateCandidate)) {
      return stateCandidate;
    }
  }
  
  return null;
}
```

## Supported Ident Formats

### ✅ Valid Formats
- `IND/KA/10203` → Extracts `KA`
- `IND/MH/1234` → Extracts `MH`
- `IND/TN/56789` → Extracts `TN`
- `IND/DL/9876` → Extracts `DL` (Delhi)
- `IND/UP/12345` → Extracts `UP` (Uttar Pradesh)

### ❌ Invalid Formats (no extraction)
- `10203` → No delimiter, can't extract
- `IND-KA-10203` → Wrong delimiter (expects `/`)
- `IND/Karnataka/10203` → State name too long (not 2 letters)
- `IND/123/10203` → Not alphabetic
- `KA/10203` → Only 2 parts (expects 3+)

## User Feedback

When state codes are successfully auto-extracted:

1. **Console log** (per player):
   ```
   [import.state] Auto-extracted state 'KA' from Ident: IND/KA/10203
   ```

2. **Toast notification** (summary):
   ```
   5 state codes auto-extracted from Ident column
   ```

3. **Player data marker**:
   - `player._stateAutoExtracted = true` for tracking
   - Visible in import logs and can be used for quality checks

## Example: Real-World Swiss-Manager Import

### Input Excel

| Rank | SNo | Name | Ident | Rating | State |
|------|-----|------|-------|--------|-------|
| 1 | 5 | Arjun Kumar | IND/KA/10203 | 2150 | *(empty)* |
| 2 | 12 | Priya Shah | IND/MH/20456 | 2100 | *(empty)* |
| 3 | 8 | Ravi Patel | IND/GJ/30789 | 2050 | *(empty)* |

### After Import (with auto-extraction)

| Rank | Name | Rating | State | Notes |
|------|------|--------|-------|-------|
| 1 | Arjun Kumar | 2150 | **KA** | Auto-extracted ✓ |
| 2 | Priya Shah | 2100 | **MH** | Auto-extracted ✓ |
| 3 | Ravi Patel | 2050 | **GJ** | Auto-extracted ✓ |

### Toast Notification
```
✓ 3 state codes auto-extracted from Ident column
```

## Integration Points

### PlayerImport Component (`src/pages/PlayerImport.tsx`)

State extraction is integrated into the `handleMappingConfirm` function at **Phase 6.5** (after preset normalizers, before unrated inference):

```typescript
// Phase 6.5: Auto-extract state from Ident column if state is missing
if (!player.state || player.state === '') {
  let identValue = player.ident;
  if (!identValue) {
    // Try to find Ident column from original row data
    const identColCandidates = ['Ident', 'ident', 'IDENT', 'Player-ID', 'ID'];
    for (const col of identColCandidates) {
      if (row[col] != null && row[col] !== '') {
        identValue = row[col];
        player.ident = identValue;
        break;
      }
    }
  }
  
  if (identValue) {
    const extractedState = extractStateFromIdent(identValue);
    if (extractedState) {
      player.state = extractedState;
      player._stateAutoExtracted = true;
      console.log(`[import.state] Auto-extracted state '${extractedState}' from Ident: ${identValue}`);
    }
  }
}
```

## Benefits

### 1. Reduced Manual Work
- No need to manually map state columns when missing
- No need to manually edit imports to add states
- Saves time for tournament organizers

### 2. Data Completeness
- Improves data quality for state-filtered categories
- Enables state-based prize eligibility checks
- Better reporting and analytics

### 3. Consistency
- Standardized 2-letter state codes (uppercase)
- Follows Indian Chess Federation conventions
- Compatible with allocator eligibility rules

### 4. Non-Destructive
- Only fills missing state fields
- Preserves explicit state values if present
- Backward compatible with existing imports

## State Codes Reference (India)

Common 2-letter state codes extracted from Ident:

| Code | State/Territory |
|------|-----------------|
| AN | Andaman & Nicobar |
| AP | Andhra Pradesh |
| AR | Arunachal Pradesh |
| AS | Assam |
| BR | Bihar |
| CH | Chandigarh |
| CG | Chhattisgarh |
| DN | Dadra & Nagar Haveli |
| DD | Daman & Diu |
| DL | Delhi |
| GA | Goa |
| GJ | Gujarat |
| HR | Haryana |
| HP | Himachal Pradesh |
| JK | Jammu & Kashmir |
| JH | Jharkhand |
| KA | Karnataka |
| KL | Kerala |
| LD | Lakshadweep |
| MP | Madhya Pradesh |
| MH | Maharashtra |
| MN | Manipur |
| ML | Meghalaya |
| MZ | Mizoram |
| NL | Nagaland |
| OR | Odisha |
| PY | Puducherry |
| PB | Punjab |
| RJ | Rajasthan |
| SK | Sikkim |
| TN | Tamil Nadu |
| TS | Telangana |
| TR | Tripura |
| UP | Uttar Pradesh |
| UK | Uttarakhand |
| WB | West Bengal |

## Troubleshooting

### State Not Extracted

**Symptom**: State field remains empty after import

**Possible causes**:
1. Ident column not detected (different header name)
2. Ident format doesn't match `IND/XX/NNNN` pattern
3. State code is not 2 letters (e.g., full state name)
4. Ident column has wrong delimiter (e.g., `-` instead of `/`)

**Solution**:
- Check console logs for `[import.state]` messages
- Verify Ident column is mapped (check Import Preview table)
- Manually map state column if Ident format is non-standard

### Wrong State Extracted

**Symptom**: State code extracted but incorrect

**Possible causes**:
1. Ident format has different position for state (e.g., `XX/IND/NNNN`)
2. Second segment is not the state code

**Solution**:
- Manually correct state values after import
- Report non-standard Ident format for future enhancement

### State Already Populated

**Symptom**: Existing state values are overwritten

**Explanation**: State extraction only runs when `state` is missing or empty. If a state value exists (even if incorrect), extraction is skipped.

**Solution**: This is by design to preserve explicit data. Clear state field before import to trigger extraction.

## Testing

### Manual Test

1. Create a test Excel with Ident column format `IND/KA/10203`
2. Leave State column empty
3. Import the file
4. Verify state is populated with `KA`
5. Check toast notification shows auto-extraction count

### Automated Test

Future enhancement: Add test case to `tests/import-swiss-manager.spec.ts`:

```typescript
test('auto-extracts state from Ident column', async ({ page }) => {
  // Upload Swiss file with Ident but no State
  // Verify state field is populated
  // Verify toast shows extraction count
});
```

## Related Documentation

- [Prize Allocation Algorithm](./allocator/README.md)
- [Import Schema & Aliases](../src/utils/importSchema.ts)
- [Swiss-Manager Import Tests](../tests/import-swiss-manager.spec.ts)
- [Organizer Guide](./allocator/organizer-guide.md)

## Future Enhancements

- Support alternative Ident formats (e.g., `XX/IND/NNNN`)
- Extract other metadata from Ident (federation, player number)
- Validate extracted state codes against known list
- Add UI toggle to enable/disable auto-extraction
- Support international federation codes (not just IND)
