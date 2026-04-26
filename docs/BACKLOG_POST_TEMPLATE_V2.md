# Post-Template v2 Backlog (Non-Template Follow-ups)

This backlog captures **confirmed, non-template** follow-ups discovered during recent audits.

- Scope is intentionally narrow: items here are **not required** for template v2 correctness.
- Do not bundle these into template v2 delivery unless explicitly re-prioritized.

## Priority: High

### 1) Dashboard legacy banner polish
- **Issue:** The dashboard still carries legacy/banner presentation debt that is functionally acceptable but visually inconsistent with the current product shell.
- **Why it matters:** It creates avoidable UX noise in the first authenticated screen and weakens perceived product quality.
- **Risk if left as-is:** Low functional risk; moderate UX consistency risk.
- **Recommended smallest future fix:** Consolidate banner copy + spacing tokens in the dashboard header area and remove stale variant styling paths without changing behavior.

### 2) Admin shell cohesion
- **Issue:** Admin/master surfaces are operational, but shell-level layout/spacing/navigation cohesion still has legacy drift across screens.
- **Why it matters:** Inconsistent shell patterns increase operator friction and maintenance overhead for future admin UI work.
- **Risk if left as-is:** Low runtime risk; moderate maintainability and UX consistency risk.
- **Recommended smallest future fix:** Standardize admin page container/header/action-row primitives and migrate only shell wrappers first (no feature behavior changes).

### 3) Duplicate/legacy RLS policies on published tournaments
- **Issue:** Migration history indicates repeated published-tournament view/policy evolutions, which can leave duplication/legacy policy clutter risk unless re-audited and normalized.
- **Why it matters:** Security policy clarity is critical; redundant policy surface increases chance of future misconfiguration.
- **Risk if left as-is:** Moderate governance/security-audit risk, even if current behavior is correct.
- **Recommended smallest future fix:** Run a targeted SQL policy inventory for `tournaments` + `published_tournaments` access paths and ship one cleanup migration that removes superseded policies only.

## Priority: Medium

### 4) Supabase types regeneration for missing view/RPC/table typing
- **Issue:** Supabase-generated typings can drift when schema/view/RPC definitions evolve; recent audits flagged this as a follow-up area.
- **Why it matters:** Type drift can hide integration regressions and weaken compile-time guarantees in data access code.
- **Risk if left as-is:** Moderate developer-experience and regression-detection risk.
- **Recommended smallest future fix:** Regenerate `src/integrations/supabase/types.ts`, review diff for missing/renamed view+RPC+table types, and commit the generated file only.

### 5) Prize-tab hierarchy polish (not required for template correctness)
- **Issue:** Prize-tab information hierarchy has polish opportunities, but these do not block or alter template v2 correctness.
- **Why it matters:** Cleaner hierarchy reduces organizer cognitive load during prize setup/review.
- **Risk if left as-is:** Low functional risk; moderate usability polish debt.
- **Recommended smallest future fix:** Apply copy/section-order/visual grouping refinements in the prize tab only, with no parsing/import/allocation logic changes.

## Priority: Low

### 6) Public details route alias cleanup (`/p/:slug/details` vs `/p/:slug`)
- **Issue:** Recent audit notes confirm both routes map to the same screen, creating redundant route surface.
- **Why it matters:** Redundant routing increases long-term maintenance and test matrix size.
- **Risk if left as-is:** Low risk; minor routing complexity and documentation drift.
- **Recommended smallest future fix:** Keep one canonical route and convert the other to an explicit redirect (or formally document alias intent).

---

## Out of scope for this backlog file
- Implementing any of the fixes above.
- Template v2 behavior changes.
- Runtime/schema/feature work.
