import type {
  TeamRankingPartition, TeamRankingRuleConfig, TeamRankingPlayer,
} from './teamRankingV2.ts';

/** Scorer-provided source inputs; never supplied by the finalize request body. */
export type TeamRankingAuditCandidate = {
  key: string;
  selectedPlayers: Array<TeamRankingPlayer & { playerId: string }>;
};

export type TeamRankingAuditAward = {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
};

export type TeamRankingAuditGroup = {
  group_by: string;
  team_size: number;
  female_slots: number;
  male_slots: number;
  scoring_mode: string;
};

/**
 * Immutable-at-write evidence payload stored on the versioned team allocation.
 * It contains IDs/numeric source inputs, not player names or uploaded files.
 *
 * The current schema does not yet enforce database-level immutability; callers
 * must write this only when creating a new allocation version.
 */
export function buildTeamRankingAwardAudit(
  groupId: string,
  groupRule: TeamRankingAuditGroup,
  prize: TeamRankingAuditAward,
  winnerKey: string,
  config: TeamRankingRuleConfig | null,
  candidates: readonly TeamRankingAuditCandidate[],
  partitions: readonly TeamRankingPartition[],
) {
  const resolved = partitions.find(p => p.status === 'resolved' && p.teams.some(t => t.key === winnerKey));
  if (!resolved || !candidates.some(t => t.key === winnerKey)) return null;

  return {
    schema_version: 2 as const,
    group_id: groupId,
    group_rule: { ...groupRule },
    award: { ...prize },
    declared_rules: config ? {
      version: config.version,
      source_hash: config.source_hash,
      published_reference: config.published_reference,
      organizer_confirmed: config.organizer_confirmed,
      criteria: config.criteria.map(rule => ({ ...rule })),
    } : null,
    winner_key: winnerKey,
    decided_by_criterion: resolved.criterion ?? null,
    // All eligible candidate inputs are necessary to audit a ranking,
    // not only the roster that received a prize.
    candidates: candidates.map(team => ({
      key: team.key,
      selected_players: team.selectedPlayers.map(player => ({
        player_id: player.playerId,
        points: player.points,
        source_hash: player.sourceHash ?? null,
        individual_tbs: Object.fromEntries(
          Object.entries(player.individualTieBreaks ?? {}).map(([ordinal, value]) => [ordinal, value ?? null]),
        ),
      })),
    })),
    partitions: partitions.map(p => ({
      status: p.status,
      criterion: p.criterion ?? null,
      reason: p.reason ?? null,
      team_keys: p.teams.map(t => t.key),
    })),
  };
}
