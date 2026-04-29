# Post-Template v2 Backlog (Non-Blocking Follow-ups)

This backlog captures **confirmed, non-blocking follow-ups** from template v2 QA.

- Current priority remains: keep template v2 simple and keep the guide in-app.
- Items below are recorded as backlog and **must not be bundled into the active template-fix batch** unless they later become blockers.

## Latest template QA carry-over (non-blocking)

### 1) Prize-tab wording/hierarchy: Main Prize appears under “Category Prizes”
- **Issue:** The Prize tab wording/hierarchy currently makes “Main Prize” appear under “Category Prizes.”
- **Why it matters:** This can blur conceptual separation between primary winners and category awards, increasing setup ambiguity for organizers.
- **Risk if left as-is:** Low functional/import risk; moderate UX clarity risk during prize configuration.
- **Smallest safe future fix:** Adjust section naming and/or ordering so “Main Prize” is presented as a first-class top-level concept distinct from category prizes, without changing prize data behavior.

### 2) Prize-tab layout density at current laptop viewport
- **Issue:** The Prize tab feels dense at the currently used laptop viewport during template flow QA.
- **Why it matters:** High visual density slows scanning and increases misreads when validating imported prize structure.
- **Risk if left as-is:** Low correctness risk; moderate readability and operator-fatigue risk.
- **Smallest safe future fix:** Apply minimal spacing/grouping polish in the Prize tab layout at the target viewport breakpoint only, with no interaction or logic changes.

### 3) Apply report wording: “Apply (Add-only)” and “skipped duplicate in draft”
- **Issue:** Apply-report phrasing currently includes wording that can read as implementation jargon (e.g., “Apply (Add-only)” and “skipped duplicate in draft”).
- **Why it matters:** Ambiguous wording can reduce confidence in import outcomes, especially for first-time organizers.
- **Risk if left as-is:** Low behavior risk; moderate comprehension/confidence risk.
- **Smallest safe future fix:** Copy-only pass on apply-report labels/messages to improve plain-language clarity while preserving exact underlying behavior.

### 4) Team-mode discoverability while toggling between Individual and Team Prizes
- **Issue:** Discoverability of Team mode remains weaker than desired when toggling between Individual and Team Prizes.
- **Why it matters:** Users can miss or underuse team-specific setup paths, causing avoidable configuration retries.
- **Risk if left as-is:** Low import correctness risk; moderate flow-efficiency risk for team tournaments.
- **Smallest safe future fix:** Add lightweight in-context cueing (labeling/hint text/placement polish) around the toggle area only, with no logic or parser updates.

### 5) Remaining template-flow polish that does not block correct import behavior
- **Issue:** Additional template-flow polish opportunities remain, but they do not block correct import behavior.
- **Why it matters:** Capturing this explicitly prevents scope creep while preserving a list of future UX refinements.
- **Risk if left as-is:** Low functional risk; low-to-moderate perceived-quality risk.
- **Smallest safe future fix:** Triage and apply only copy/layout micro-polish changes behind focused QA checks, explicitly excluding parser/runtime behavior work.

---

## Guardrails for this backlog
- Docs/backlog recording only.
- No runtime changes.
- No parser changes.
- No UI behavior changes.
- No broad product cleanup bundled with template QA fixes.
