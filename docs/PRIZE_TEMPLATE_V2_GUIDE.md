# Prize Template v2 (XLSX) — Organizer Guide

This guide describes the **default template path** in Prize Manager: `prize_template_v2.xlsx`.

Use this when preparing uploads from **Tournament Setup → Download Template (v2)** and **Import from Template (v2 default)**.

> Legacy advanced format: v1 is still available in `docs/PRIZE_TEMPLATE_V1_GUIDE.md`.

## What v2 is for

v2 is a **single-sheet, simple import format** for:

- creating/reusing prize categories,
- importing individual prize rows (cash/trophy/medal/gift), and
- quickly setting common category criteria from the same row set.

In short: v2 imports **categories + individual prizes**.

v2 is intentionally limited so operators can import quickly, then finish advanced setup in UI.

## What remains manual in UI

After v2 import, keep configuring these manually in the app:

1. **Team Prizes** in the **Team Prizes section/tab** (team prizes are not imported from v2).
2. **Advanced allocation/rule configuration** (strict comparisons, cutoff strategy/details, priority/tie behavior, and other advanced controls).

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
| `Gender` | No | `F`, `M`, or `OPEN` (case-insensitive input accepted). |
| `Min Age` | No | Number. |
| `Max Age` | No | Number. |
| `Min Rating` | No | Number. |
| `Max Rating` | No | Number. |
| `Include Unrated` | No | Boolean: `yes/no`, `y/n`, `true/false`, `1/0`. |
| `Unrated Only` | No | Boolean: `yes/no`, `y/n`, `true/false`, `1/0`. |
| `Allowed States` | No | Comma-separated list (example `MH, GJ`). |
| `Allowed Cities` | No | Comma-separated list. |
| `Allowed Clubs` | No | Comma-separated list. |
| `Notes` | No | Optional note field; not used in prize creation logic. |

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

In v2, category rows are expected to repeat (one row per prize/place). For a repeated category:

- `Is Main` must not conflict across rows.
- Criteria fields (`Gender`, ages, ratings, unrated flags, allowed lists) must stay consistent.
- If a row omits criteria columns, previously established criteria for that category remain in effect.

## What causes validation errors

Common blocking errors include:

- missing `Category` or missing/invalid `Place`,
- invalid boolean values in `Is Main`, `Trophy`, `Medal`, `Include Unrated`, `Unrated Only`,
- invalid number values (`Cash Amount`, age/rating fields),
- invalid `Gender` (must be `F`, `M`, or `OPEN`),
- invalid `Gift Qty` (must be whole number `>= 0`),
- conflicting repeated category configuration (`Is Main` or criteria mismatch),
- duplicate place within same category (for example two rows resulting in `Women` place `1`).

## Realistic sample rows

| Category | Is Main | Place | Cash Amount | Trophy | Medal | Gift Name | Gift Qty | Gender | Min Age | Max Age | Min Rating | Max Rating | Include Unrated | Unrated Only | Allowed States | Allowed Cities | Allowed Clubs | Notes |
|---|---|---|---:|---|---|---|---:|---|---:|---:|---:|---:|---|---|---|---|---|---|
| Main Prize | yes | 1 | 10000 | yes | yes | Chess Clock | 1 | OPEN |  |  |  |  | no | no |  |  |  | Overall champion |
| Main Prize | yes | 2-5 | 2500 | yes | no |  |  | OPEN |  |  |  |  | no | no |  |  |  | Main runner-up range |
| Women | no | 1 | 3000 | yes | yes | Gift Voucher | 2 | F |  |  |  |  | no | no | MH, GJ | Mumbai, Pune |  | Category prize |

## Recommended operator flow

1. Download `prize_template_v2.xlsx`.
2. Fill `Prizes` rows (repeat category values consistently).
3. Import using **Import from Template (v2 default)**.
4. Resolve validation errors shown in dialog.
5. Apply import.
6. Complete **Team Prizes** and any **advanced allocation rules** manually in UI.

> Need team-prize import behavior? Use the legacy advanced v1 template path. The default v2 path does not import team prizes.
