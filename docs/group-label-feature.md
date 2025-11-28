# Group Label Feature (Gr Column Support)

## Overview

The `group_label` field enables Prize-Manager to use the Swiss-Manager "Gr" (Group) column as a generic grouping mechanism for prize allocation. This allows organizers to create categories like "Best in Raipur" purely from the Gr column, without overloading city/state/disability fields.

## Data Model

### Players Table

- **Column**: `group_label` (text, nullable)
- **Purpose**: Raw value from Swiss-Manager Gr column, trimmed, case preserved
- **Source**: Automatically populated during player import from the "Gr" column

### Category Criteria

- **Field**: `criteria_json.allowed_groups` (string array)
- **Purpose**: List of group labels that are eligible for this category
- **Matching**: Case-insensitive, trimmed comparison

## Import Behavior

When importing players from Swiss-Manager:

1. The `Gr` column value is read and trimmed
2. The raw value is stored in `players.group_label`
3. **PC Compatibility**: If the value contains "PC" (case-insensitive), it also sets:
   - `players.disability = 'PC'`
   - `players.tags_json.special_group = ['PC']`

## Allocator Behavior

During prize allocation:

1. If `criteria_json.allowed_groups` is empty or undefined, the group dimension is ignored
2. If set, only players whose `group_label` (case-insensitive) matches one of the allowed groups are eligible
3. Group filter is AND-combined with other criteria (age, rating, gender, etc.)

### Reason Codes

- `group_ok`: Player's group matches allowed groups
- `group_excluded`: Player's group does not match allowed groups

## UI Configuration

In the Edit Rules sheet:

1. Navigate to a category's "Edit Rules"
2. Find the "Group (Gr column from Swiss-Manager)" field
3. Enter comma-separated group labels (e.g., "Raipur, Durg")
4. Save the rules

## Example Use Cases

### 1. Best in Raipur

**Setup:**
- Gr column in Swiss-Manager: `Raipur` for Raipur players, `Durg` for others
- Category criteria: `allowed_groups: ["Raipur"]`

**Result:** Only players with Gr="Raipur" are eligible

### 2. PC Special Prize (via Gr column)

**Setup:**
- Gr column: `PC` for physically challenged players
- Category criteria: `allowed_groups: ["PC"]`

**Result:** Same players as using `allowed_disabilities: ["PC"]`

### 3. Section-Based Categories

**Setup:**
- Gr column: `A`, `B`, `C` for different sections
- Category criteria: `allowed_groups: ["A", "B"]`

**Result:** Only Section A and B players are eligible

### 4. Combined Filters

**Setup:**
- Category: "Best Raipur Senior U1600"
- Criteria: `allowed_groups: ["Raipur"], min_age: 60, max_rating: 1600`

**Result:** Must be from Raipur AND age 60+ AND rating under 1600

## Migration Notes

The `group_label` column was added via migration. No action needed for existing tournaments - the field will be null for previously imported players. Re-import players to populate group labels from the Gr column.
