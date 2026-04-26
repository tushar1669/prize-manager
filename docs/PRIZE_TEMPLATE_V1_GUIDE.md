# Prize Template v1 (XLSX) — Organizer Guide

This guide describes the **current behavior** of `prize_template_v1.xlsx` in Prize Manager.

Use this when preparing uploads from **Tournament Setup → Import Prizes from XLSX Template**.

## What this template import supports today

The importer currently supports:

- Creating/reusing **categories** by name.
- Creating **individual prizes** (cash/trophy/medal/gifts) by category + place.
- Creating/reusing **team groups** by group name.
- Creating **team prizes** (cash/trophy/medal) by group + place.
- Place ranges (for example `6-10`) that auto-expand into individual places.
- Add-only behavior (existing category/group names are reused; existing place rows are skipped).

## What must still be configured manually in UI

After template import, organizers must still verify/configure in the UI:

1. **Category criteria / allocation rules** (age/rating/gender/unrated/state/city/club logic).  
   Current import parses these fields for validation but does not apply them to saved category config.
2. **Advanced rule settings** (strict age comparisons, cutoff mode/date behavior, priorities, tie behavior, etc.).
3. **Team group slot/scoring specifics**. Imported team groups currently use default backend values for fields such as female/male slots and scoring mode.
4. Any additional prize details not represented in the sheet columns.

---

## Sheet-by-sheet instructions

## 1) `Categories`

Defines categories and optional safe criteria columns.

### Columns

- `Name` (**required**) — category name. Must be unique for clear results.
- `Is Main` — boolean (`yes/no`, `true/false`, `1/0`, `y/n`).
- `Gender` — `F`, `M`, or `OPEN`.
- `Min Age`, `Max Age` — numbers.
- `Min Rating`, `Max Rating` — numbers.
- `Include Unrated`, `Unrated Only` — booleans.
- `Allowed States`, `Allowed Cities`, `Allowed Clubs` — comma-separated lists.

### Practical example rows

| Name | Is Main | Gender | Min Age | Max Age | Min Rating | Max Rating | Include Unrated | Unrated Only | Allowed States | Allowed Cities | Allowed Clubs |
|---|---|---|---:|---:|---:|---:|---|---|---|---|---|
| Main Prize | yes | OPEN |  |  |  |  | no | no |  |  |  |
| Women | no | F |  |  |  |  | no | no |  |  |  |
| U1800 | no | OPEN |  |  | 0 | 1800 | yes | no | MH, GJ | Mumbai, Pune |  |

### Notes

- If more than one row has `Is Main = yes`, the importer warns and one canonical Main category is reused during apply.
- Category names are matched case-insensitively when linking from other sheets.

## 2) `Prizes`

Defines category prize rows.

### Columns

- `Category` (**required**) — must match a `Categories.Name` value.
- `Place` (**required**) — either:
  - single number: `1`
  - range: `6-10`
- `Cash Amount` — number (blank means `0`).
- `Trophy`, `Medal` — booleans.
- `Gift` — free text gift names; split by comma or semicolon into multiple items.

### Practical example rows

| Category | Place | Cash Amount | Trophy | Medal | Gift |
|---|---|---:|---|---|---|
| Main Prize | 1 | 10000 | yes | yes | Chess Clock |
| Main Prize | 2 | 6000 | yes | no |  |
| Main Prize | 6-10 | 0 | no | yes | Certificate |
| Women | 1 | 3000 | yes | yes | DGT Board; Gift Voucher |

### Place range behavior

`6-10` creates five prize entries: place 6, 7, 8, 9, and 10.

### Current limitations

- No separate **gift quantity** column in v1 template.
  - If you need quantity, repeat the gift label in `Gift` text (for example `Voucher, Voucher`) or adjust manually after import.
- Duplicate places in the same category are rejected/skipped.

## 3) `Category Rules`

Optional sheet for safe criteria fields.

### Columns

- `Category` — must match an existing category name.
- Supported safe rule fields only:
  - `gender`
  - `min_age`, `max_age`
  - `min_rating`, `max_rating`
  - `include_unrated`, `unrated_only`
  - `allowed_states`, `allowed_cities`, `allowed_clubs`

### Practical example row

| Category | gender | min_age | max_age | min_rating | max_rating | include_unrated | unrated_only | allowed_states | allowed_cities | allowed_clubs |
|---|---|---:|---:|---:|---:|---|---|---|---|---|
| Women | F |  |  |  |  | no | no |  |  |  |

### Safety boundary

Do **not** add advanced/non-safe fields (for example strict-age flags, cutoff policy fields, priority modes, custom tie logic).

### Operator note (important)

`Category Rules` duplicates the same safe criteria intent already represented by criteria columns in `Categories`. To avoid confusion, use **one method consistently** in your operations:

- Either maintain criteria in `Categories` columns, **or**
- maintain them in `Category Rules`.

Then confirm final category rule configuration in the UI before allocation.

## 4) `Team Groups`

Optional sheet to define team/institution group definitions.

### Columns

- `Name` — team group name.
- `Group By` — one of:
  - `team`
  - `club`
  - `city`
  - `state`
  - `group_label`
  - `type_label`
- `Team Size` — number.
- `Female Slots` — number.
- `Male Slots` — number.

### Practical example row

| Name | Group By | Team Size | Female Slots | Male Slots |
|---|---|---:|---:|---:|
| Best Club | club | 4 | 0 | 0 |

### Current limitation

`Female Slots` and `Male Slots` values are validated in parsing, but current apply flow uses default slot values in backend create step. Re-check and edit team group configuration in UI after import.

## 5) `Team Prizes`

Optional sheet for team prize rows.

### Columns

- `Group` — must match `Team Groups.Name`.
- `Place` — single number (`1`) or range (`2-5`).
- `Cash Amount` — number (blank means `0`).
- `Trophy`, `Medal` — booleans.

### Practical example rows

| Group | Place | Cash Amount | Trophy | Medal |
|---|---|---:|---|---|
| Best Club | 1 | 5000 | yes | yes |
| Best Club | 2 | 2500 | yes | no |

## 6) `Instructions`

The workbook includes an `Instructions` sheet with a quick reminder summary. Follow this guide for exact current behavior and operational caveats.

---

## Accepted value formats (quick reference)

- **Booleans:** `yes/no`, `y/n`, `true/false`, `1/0`
- **Gender:** `F`, `M`, `OPEN`
- **Place:** `N` or `N-M` where `N <= M`
- **Lists:** comma-separated values for allowed states/cities/clubs
- **File type:** `.xlsx` or `.xls` only

## Recommended operator workflow

1. Fill `Categories` and `Prizes` first.
2. Add optional `Category Rules`, `Team Groups`, and `Team Prizes`.
3. Import and resolve validation errors.
4. Apply template.
5. In UI, manually confirm:
   - category eligibility/rule config,
   - team group settings,
   - any advanced prize logic not represented in template.
