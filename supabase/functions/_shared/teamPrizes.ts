export type TeamGroupByKey = 'team' | 'club' | 'city' | 'state' | 'group_label' | 'type_label';

export type TeamPrizePlayer = {
  id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
  club?: string | null;
  team?: string | null;
  city?: string | null;
  state?: string | null;
  group_label?: string | null;
  type_label?: string | null;
};

export type TeamPrizeInstitutionScore = {
  key: string;
  total_points: number;
  rank_sum: number;
  best_individual_rank: number;
  team: TeamPrizePlayer[];
};

export function compareInstitutions(a: TeamPrizeInstitutionScore, b: TeamPrizeInstitutionScore): number {
  if (b.total_points !== a.total_points) return b.total_points - a.total_points;
  if (a.rank_sum !== b.rank_sum) return a.rank_sum - b.rank_sum;
  if (a.best_individual_rank !== b.best_individual_rank) return a.best_individual_rank - b.best_individual_rank;
  return a.key.localeCompare(b.key);
}

/**
 * Why an institution was excluded from `scored`. ARCHITECTURE §4 (fail codes).
 * Only `team_short_roster` is produced today; the remaining fail codes
 * (`below_minimum_roster`, `female_slots_unfilled`) arrive with TC1.4 onward.
 */
export type TeamExclusionReason = 'team_short_roster';

export type TeamExclusion = {
  key: string;
  reason: TeamExclusionReason;
  /** How many players the institution actually entered — fewer than `teamSize`. */
  playerCount: number;
};

export type TeamScoresWithReasons = {
  scored: TeamPrizeInstitutionScore[];
  excluded: TeamExclusion[];
  /**
   * Count of players discarded before grouping because their `groupBy` column was
   * null, empty or whitespace-only — ARCHITECTURE §4 fail code `missing_group_field`.
   * This is a PLAYER-level condition: such players have no key, so they cannot
   * appear in `excluded`, and no placeholder key is invented for them.
   */
  droppedPlayersWithoutKey: number;
};

/**
 * The real implementation. Identical selection and scoring to the behaviour pinned
 * by tests/institution/team-prizes.spec.ts — an institution dropped before is still
 * dropped, it is merely now reported. See ARCHITECTURE §1.3 and §1.4.
 */
export function computeTeamScoresWithReasons(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey
): TeamScoresWithReasons {
  const grouped = new Map<string, TeamPrizePlayer[]>();
  let droppedPlayersWithoutKey = 0;

  for (const player of players) {
    const rawKey = (player[groupBy] as string | null | undefined) ?? null;
    const key = rawKey?.trim();
    if (!key) {
      droppedPlayersWithoutKey += 1;
      continue;
    }

    const list = grouped.get(key) ?? [];
    list.push(player);
    grouped.set(key, list);
  }

  const scored: TeamPrizeInstitutionScore[] = [];
  const excluded: TeamExclusion[] = [];

  for (const [key, groupPlayers] of grouped.entries()) {
    const ordered = [...groupPlayers].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.id.localeCompare(b.id);
    });

    const topPlayers = ordered.slice(0, teamSize);
    if (topPlayers.length < teamSize) {
      excluded.push({ key, reason: 'team_short_roster', playerCount: groupPlayers.length });
      continue;
    }

    scored.push({
      key,
      total_points: topPlayers.reduce((sum, p) => sum + (Number.isFinite(p.points) ? p.points : 0), 0),
      rank_sum: topPlayers.reduce((sum, p) => sum + p.rank, 0),
      best_individual_rank: topPlayers[0]?.rank ?? 0,
      team: topPlayers,
    });
  }

  return {
    scored: scored.sort(compareInstitutions),
    // Sorted by key so the diagnostics are stable under input reordering.
    excluded: excluded.sort((a, b) => a.key.localeCompare(b.key)),
    droppedPlayersWithoutKey,
  };
}

/** Thin wrapper: the scored institutions only. Signature and return type unchanged. */
export function computeTeamScores(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey
): TeamPrizeInstitutionScore[] {
  return computeTeamScoresWithReasons(players, teamSize, groupBy).scored;
}

export function detectTieAtPrizeBoundary(
  scoredInstitutions: TeamPrizeInstitutionScore[],
  winnerCount: number
): string[] {
  if (winnerCount <= 0 || scoredInstitutions.length <= winnerCount) return [];
  const boundary = scoredInstitutions[winnerCount - 1];
  if (!boundary) return [];

  return scoredInstitutions
    .filter((row) => row.total_points === boundary.total_points)
    .map((row) => row.key)
    .sort((a, b) => a.localeCompare(b));
}
