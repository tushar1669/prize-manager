# UI Conventions

Governing rules for styling surfaces in Prize Manager. These are not preferences — they
describe how the app actually renders today.

## 1. Dark-only

Prize Manager is a **permanently dark** application. Light mode is not planned.

The facts that follow from that, all of which are verifiable in the tree:

- `tailwind.config.ts` sets `darkMode: ["class"]`, but **nothing ever adds a `dark` class to
  `<html>`**. No provider, no theme toggle, no script.
- There is **no `.dark` block in `src/index.css`**. The dark palette lives directly in
  `:root`, so it is the one and only palette the app ever serves.
- Therefore **every `dark:` utility in the codebase is dead code**. It is never matched and
  never applied. Deleting a `dark:` variant changes nothing on screen.
- Therefore **every literal light-palette utility renders literally**. `bg-amber-100`,
  `text-amber-800`, `bg-emerald-50`, `bg-red-50` and friends paint near-white blocks on a
  near-black page. This was the bug that motivated this document.

The practical consequence: a pair like `bg-amber-100 dark:bg-amber-950/60` does **not** give
you a light value and a dark value. It gives you the light value, always. The `dark:` half is
decoration.

## 2. Semantic tokens

`src/index.css` defines `--success`, `--warning`, `--info`, `--destructive`, and the
`--status-draft` / `--status-finalized` / `--status-published` set. `tailwind.config.ts`
exposes `success`, `warning`, `info` and `destructive` as colors. **Use these.**

| Meaning | Background | Text | Border |
| --- | --- | --- | --- |
| Warning / flagged | `bg-warning/10` | `text-warning` | `border-warning/30` |
| Success / verified | `bg-success/10` | `text-success` | `border-success/30` |
| Error / rejected | `bg-destructive/10` | `text-destructive` | `border-destructive/30` |
| Info | `bg-info/10` | `text-info` | `border-info/30` |
| Neutral | `bg-muted/40` | `text-muted-foreground` | `border-border` |

When a literal utility you are replacing carries no clear semantic meaning, use the **neutral**
row. Do not invent a new token and do not add new CSS variables to reach for a shade.

## 3. Forbidden patterns

- **Never use raw Tailwind palette utilities for UI surfaces** — `bg-amber-*`, `text-emerald-*`,
  `border-red-*`, `bg-yellow-*`, and every other numbered-shade utility. They are tuned for a
  light background that this app does not have.
- **Never write `dark:` variants.** They cannot match. A `dark:` utility is either dead weight
  or, worse, a signal that the author believed a light mode existed and picked the sibling
  utility accordingly.
- **Never assume hover reveals content.** A resting state must be legible on its own. Hover is
  an enhancement, never the thing that makes text readable. Watch for this in tables: the base
  `TableRow` class carries `hover:bg-muted/50`, which will paint over a translucent resting
  tint and make a block appear legible only under the cursor.

## 4. Chips and badges

Chips, badges, and inline flag pills use a slightly stronger fill than a full surface, so they
read as discrete objects rather than regions:

```
bg-<token>/15  text-<token>  border border-<token>/30
```

For example a flagged chip is `bg-warning/15 text-warning border border-warning/30`. Note that
shadcn's `Badge variant="outline"` already supplies `border`, so pass only the color there.

## 5. Printing

`.pm-print-surface` in `src/index.css` overrides the `background`, `card` and `muted` tokens
for print output. **Do not modify it.**

Status tokens (`success`, `warning`, `destructive`, `info`, and the `--status-*` set)
intentionally survive into print — a printed prize sheet or payment record must keep carrying
its status meaning, so those colors are deliberately not neutralized.

## 6. Category colours (bounded exception)

Some chips encode a **category**, not a status — the criteria chips that describe age, rating,
state, gender, or type. Forcing those onto `success` / `warning` / `destructive` / `info` would
assert a status meaning that does not exist, and forcing them all to neutral would destroy the
information the user relies on to scan a list of categories at a glance.

For these, and **only** these, raw Tailwind hues are permitted, restricted to this exact shape:

```
bg-<hue>-500/15  text-<hue>-300  border-<hue>-500/30
```

The `/15` fill and the `-300` text shade are chosen for legibility on the near-black background.
`text-<hue>-700` is **forbidden** — it is dark text on a dark background, which was the original
bug.

Permitted hues for this exception: `violet`, `amber`, `blue`, `pink`, `sky`, `emerald`, `orange`,
`teal`, `indigo`.

This exception applies to `src/components/prizes/CategoryCriteriaChips.tsx` only. Any new use
requires the same justification: the colour must encode a category, never a status.

## 7. Before you commit

- [ ] No raw palette utilities added (`bg-amber-*`, `text-emerald-*`, `border-red-*`, …).
- [ ] No `dark:` variants added.
- [ ] Resting state is legible without hover.
