# Read-only Runtime/UI Flow Audit

## Scope
Observe the current application exactly as rendered, without code, data, role, payment, publication, or configuration changes.

## Method
1. Establish the live preview baseline and available authenticated session state.
2. Audit the unauthenticated journey from `/public`, including public navigation and any published tournament detail/result pages reachable from visible links.
3. Restore the existing authenticated session, if available, and audit its actual role and natural landing page.
4. Walk every safely reachable organizer screen and secondary action, recording exact labels, routes, states, disabled/absent controls, dialogs, results, and recovery paths.
5. If the authenticated account is a master, audit every visible `/admin` section without executing moderation, payment, publication, deletion, archive, or other consequential actions.
6. Inspect any materially different existing organizer/tournament states reachable without creating data or changing production state.
7. Record cross-role handoff endpoints separately; mark connections not exercised end-to-end as **NOT RUNTIME VERIFIED**.
8. Capture representative screenshots only for legitimately accessible screens.
9. Produce one evidence report with the requested sections, status labels, action matrix, screenshot index, owner-evidence questions, and final counts.

## Safety boundaries
- Safe navigation, tab changes, expandable panels, non-submitting dialogs, and cancellation are allowed.
- Destructive, financial, moderation, publish/unpublish, submission, approval/rejection, archive/delete, and data-writing actions will be recorded as **VISIBLE — NOT EXECUTED**.
- No fake credentials, test records, random route probing, source-derived assumptions, or application modifications.
- Any inaccessible role or prerequisite state will be marked **NOT RUNTIME VERIFIED**.

## Evidence standard
Every runtime claim will come from the rendered UI and observed navigation result. Potential discrepancies will be labeled **POSSIBLE ISSUE — NEEDS SOURCE RECONCILIATION**, not treated as confirmed defects.
