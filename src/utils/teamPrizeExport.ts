import type { TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';

/** One row per FILLED team award, matching the Team Prizes winners table. */
export function buildTeamPrizeExportRows(data: TeamPrizeResultsResponse | null, hasFullAccess: boolean) {
  if (!hasFullAccess || !data) return [];

  return data.groups.flatMap(group => {
    // Mirror the Team Prize view: never include ineligible teams or unfilled prize rows.
    const filled = group.prizes
      .filter(prize => prize.winner_institution !== null)
      .sort((left, right) => left.place - right.place);
    const allPointsMissing =
      group.eligible_institutions * group.config.team_size > 0 &&
      (group as typeof group & { players_without_points?: number }).players_without_points ===
        group.eligible_institutions * group.config.team_size;

    return filled.map(prize => {
      const winner = prize.winner_institution!;
      return {
        'Prize Group': group.name,
        Place: prize.place,
        'Team / Institution': winner.label,
        'Team Players': winner.players.map(player => `${player.name} (#${player.rank})`).join(', '),
        Points: allPointsMissing ? '' : winner.total_points,
        'Rank Sum': winner.rank_sum,
        'Best Rank': winner.best_individual_rank,
        'Cash Amount': prize.cash_amount,
        Trophy: prize.has_trophy ? 'Yes' : 'No',
        Medal: prize.has_medal ? 'Yes' : 'No',
      };
    });
  });
}
