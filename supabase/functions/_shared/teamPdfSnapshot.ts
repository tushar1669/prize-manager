/**
 * Exact-allocation-version Team Prize PDF rows. No live ranking, Rank Sum
 * decision, publication counter or default-to-latest fallback is permitted.
 *
 * Group and prize metadata are current relational definitions, not historical
 * snapshots. If an awarded historical ID is absent from them, fail closed.
 */
export interface PinnedTeamGroup {
  id: string;
  name: string;
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
}

export interface PinnedTeamPrize {
  id: string;
  group_id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
}

export interface PinnedPlayer {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
}

export interface PinnedTeamAllocation {
  group_id: string;
  prize_id: string;
  place: number;
  institution_key: string;
  total_points: number;
  player_snapshot: PinnedPlayer[];
}

export function buildVersionedTeamPdfResults(
  groups: PinnedTeamGroup[],
  prizes: PinnedTeamPrize[],
  allocations: PinnedTeamAllocation[],
) {
  const groupIds = new Set(groups.map(group => group.id));
  const prizeById = new Map(prizes.map(prize => [prize.id, prize]));
  const awardedPrizes = new Map<string, PinnedTeamAllocation>();

  for (const row of allocations) {
    const prize = prizeById.get(row.prize_id);
    if (!groupIds.has(row.group_id) || !prize ||
        prize.group_id !== row.group_id || prize.place !== row.place ||
        awardedPrizes.has(row.prize_id) ||
        !Number.isFinite(row.total_points) ||
        !Array.isArray(row.player_snapshot) || row.player_snapshot.length === 0 ||
        row.player_snapshot.some(player =>
          !player || typeof player.name !== 'string' ||
          !Number.isFinite(player.rank) || !Number.isFinite(player.points),
        )) {
      throw new Error('Historical Team Prize snapshot cannot be reconstructed safely');
    }
    awardedPrizes.set(row.prize_id, row);
  }

  return {
    players_loaded: 0,
    max_rank: 0,
    groups: groups.map(group => {
      const groupPrizes = prizes.filter(prize => prize.group_id === group.id);
      return {
        group_id: group.id,
        name: group.name,
        config: {
          group_by: group.group_by,
          team_size: group.team_size,
          female_slots: group.female_slots,
          male_slots: group.male_slots,
          scoring_mode: group.scoring_mode,
        },
        // Historical eligibility counts are not stored; this is the count of
        // persisted awarded snapshots, not a recomputed eligibility verdict.
        snapshot_award_count: allocations.filter(row => row.group_id === group.id).length,
        eligible_institutions: 0,
        ineligible_institutions: 0,
        ineligible_reasons: [] as string[],
        prizes: groupPrizes.map(prize => {
          const allocation = awardedPrizes.get(prize.id);
          const players = allocation?.player_snapshot ?? [];
          return {
            id: prize.id,
            place: prize.place,
            cash_amount: prize.cash_amount,
            has_trophy: prize.has_trophy,
            has_medal: prize.has_medal,
            is_active: true,
            winner_institution: allocation
              ? {
                  key: allocation.institution_key,
                  label: allocation.institution_key,
                  total_points: allocation.total_points,
                  // Retain legacy compatibility fields; never use them for new ordering.
                  rank_sum: players.reduce((sum, player) => sum + player.rank, 0),
                  best_individual_rank: Math.min(...players.map(player => player.rank)),
                  players,
                }
              : null,
          };
        }),
      };
    }),
  };
}
