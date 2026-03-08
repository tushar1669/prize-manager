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

export function computeTeamScores(
  players: TeamPrizePlayer[],
  teamSize: number,
  groupBy: TeamGroupByKey
): TeamPrizeInstitutionScore[] {
  const grouped = new Map<string, TeamPrizePlayer[]>();

  for (const player of players) {
    const rawKey = (player[groupBy] as string | null | undefined) ?? null;
    const key = rawKey?.trim();
    if (!key) continue;

    const list = grouped.get(key) ?? [];
    list.push(player);
    grouped.set(key, list);
  }

  const scored: TeamPrizeInstitutionScore[] = [];

  for (const [key, groupPlayers] of grouped.entries()) {
    const ordered = [...groupPlayers].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.id.localeCompare(b.id);
    });

    const topPlayers = ordered.slice(0, teamSize);
    if (topPlayers.length < teamSize) continue;

    scored.push({
      key,
      total_points: topPlayers.reduce((sum, p) => sum + (Number.isFinite(p.points) ? p.points : 0), 0),
      rank_sum: topPlayers.reduce((sum, p) => sum + p.rank, 0),
      best_individual_rank: topPlayers[0]?.rank ?? 0,
      team: topPlayers,
    });
  }

  return scored.sort(compareInstitutions);
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
