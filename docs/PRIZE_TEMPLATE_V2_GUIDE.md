# Prize Template v2 (XLSX) — Organizer Guide

This guide describes the **default template path** in Prize Manager: `prize_template_v2.xlsx`.

Use this when preparing uploads from **Tournament Setup → Download Template (v2)** and **Import from Template (v2 default)**.

> Legacy advanced format: v1 is still available in `docs/PRIZE_TEMPLATE_V1_GUIDE.md`.

## What v2 is for

v2 is a **single-sheet, simple import format** for:

- creating/reusing prize categories,
- importing individual prize rows (cash/trophy/medal/gift), and
- importing quickly without rule-related columns in the default sheet.

In short: v2 imports **categories + individual prizes**.

v2 is intentionally limited so operators can import quickly, then finish advanced setup in UI.

## What remains manual in UI

After v2 import, keep configuring these manually in the app:

1. **Team Prizes** in the **Team Prizes section/tab** (team prizes are not imported from v2).
2. **Category rules/eligibility criteria** (gender, age/rating bounds, unrated flags, allowed states/cities/clubs).
3. **Advanced allocation/rule configuration** (strict comparisons, cutoff strategy/details, priority/tie behavior, and other advanced controls).

---

## v2 workbook structure

- Required sheet: **`Prizes`**
- Informational sheet: **`Instructions`**

Only `Prizes` rows are parsed for import.

## `Prizes` sheet columns (exact)

| Column | Required | Accepted values / behavior |
|---|---|---|
| `Category` | Yes | Any non-empty text. Reused case-insensitively if category already exists. |
| `Is Main` | No | Boolean: `yes/no`, `y/n`, `true/false`, `1/0`. |
| `Place` | Yes | Single place `N` or range `N-M` where `N <= M` (example `6-10`). |
| `Cash Amount` | No | Number. Blank defaults to `0`. |
| `Trophy` | No | Boolean: `yes/no`, `y/n`, `true/false`, `1/0`. |
| `Medal` | No | Boolean: `yes/no`, `y/n`, `true/false`, `1/0`. |
| `Gift Name` | No | Free text gift label (example `Chess Clock`). |
| `Gift Qty` | No | Whole number `>= 0`. If provided with `Gift Name`, gift is repeated that many times. |
| `Notes` | No | Optional note field; not used in prize creation logic. |

> Older v2 files that still contain legacy criteria columns are still tolerated for backward compatibility.

## Place ranges

- `1` imports one prize entry for place 1.
- `6-10` expands to places **6, 7, 8, 9, 10**.
- Invalid ranges (for example `10-6`) are rejected.

## Boolean values

Accepted boolean formats across v2 fields:

- `yes` / `no`
- `y` / `n`
- `true` / `false`
- `1` / `0`

Any other non-empty value causes a validation error.

## Gift Name + Gift Qty behavior

- If `Gift Name` is present and `Gift Qty` is `3`, importer creates three gift items with that same name.
- `Gift Qty` must be a whole number `>= 0`.
- If `Gift Name` is present and `Gift Qty` is blank, a single gift token is imported from the name text.

## Repeated category row rules

In default v2, category rows are expected to repeat (one row per prize/place). For a repeated category:

- `Is Main` must not conflict across rows.
- Older v2 files with legacy criteria columns are still accepted and validated for consistency.

## What causes validation errors

Common blocking errors include:

- missing `Category` or missing/invalid `Place`,
- invalid boolean values in `Is Main`, `Trophy`, `Medal`, `Include Unrated`, `Unrated Only`,
- invalid number values (`Cash Amount`),
- invalid `Gift Qty` (must be whole number `>= 0`),
- conflicting repeated category configuration (`Is Main` or criteria mismatch),
- duplicate place within same category (for example two rows resulting in `Women` place `1`).

## Realistic sample rows

| Category | Is Main | Place | Cash Amount | Trophy | Medal | Gift Name | Gift Qty | Notes |
|---|---|---|---:|---|---|---|---:|---|
| Main Prize | yes | 1 | 10000 | yes | yes | Chess Clock | 1 | Overall champion |
| Main Prize | yes | 2-5 | 2500 | yes | no |  |  | Main runner-up range |
| Women | no | 1 | 3000 | yes | yes | Gift Voucher | 2 | Category prize |

## Recommended operator flow

1. Download `prize_template_v2.xlsx`.
2. Fill `Prizes` rows (repeat category values consistently).
3. Import using **Import from Template (v2 default)**.
4. Resolve validation errors shown in dialog.
5. Apply import.
6. Complete **Team Prizes** and any **advanced allocation rules** manually in UI.

> Need team-prize import behavior? Use the legacy advanced v1 template path. The default v2 path does not import team prizes.
