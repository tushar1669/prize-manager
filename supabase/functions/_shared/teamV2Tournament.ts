/**
 * Is this a Team Prizes V2 tournament?
 *
 * Mirrors the database fence `reject_team_v2_legacy_allocation`: a tournament
 * is V2 once it is listed in `team_v2_canary_tournaments` (enabled or not —
 * enrolment is permanent for write-fencing) or has any saved V2 team award
 * (`team_allocations.ranking_snapshot` set). Every other tournament keeps the
 * standard team ranking and the standard Finalize route, exactly as before
 * Team V2 shipped.
 *
 * Returns null when the check itself fails; callers must then fail closed.
 */
type Db = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
        not: (column: string, op: string, value: null) => {
          limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
        };
      };
    };
  };
};

export async function isTeamV2Tournament(db: Db, tournamentId: string): Promise<boolean | null> {
  const [enrolled, history] = await Promise.all([
    db.from('team_v2_canary_tournaments').select('tournament_id')
      .eq('tournament_id', tournamentId).limit(1),
    db.from('team_allocations').select('id')
      .eq('tournament_id', tournamentId).not('ranking_snapshot', 'is', null).limit(1),
  ]);
  if (enrolled.error || history.error || !enrolled.data || !history.data) return null;
  return enrolled.data.length > 0 || history.data.length > 0;
}
