// TC1.6-B — free tier is capped at one active team prize group.
//
// A pure predicate so the gate is testable without rendering TeamPrizesEditor
// (which needs react-query + supabase mocking to render at all). The editor
// wires this to `useTournamentAccess().isFreeSmall` — itself sourced from the
// canonical `tournament_billing_basis` / `tournament_pro_tier` DB helpers, not
// reimplemented here — and to its own count of `is_active` groups.
//
// CLIENT-SIDE ONLY. See docs/team-championship/ARCHITECTURE.md "TC1.6-debt":
// nothing server-side ties group count to billing tier.

/**
 * True when a free-tier tournament (<=150 players) already has an active team
 * prize group, so "Add Team Prize Group" must be disabled.
 */
export function isTeamPrizeGroupLimitReached(isFreeSmall: boolean, activeGroupCount: number): boolean {
  return isFreeSmall && activeGroupCount >= 1;
}
