/**
 * Pre-write contract for the versioned Team Prizes preview returned to finalize.
 *
 * A v2 ranking issue means an award may cross a tied or unverified prize
 * boundary. Never insert individual allocations before this check succeeds.
 */
import { parseTeamRankingRuleConfig } from './teamRankingV2.ts';
import type { buildTeamRankingAwardAudit } from './teamRankingAudit.ts';

type TeamRankingAudit = NonNullable<ReturnType<typeof buildTeamRankingAwardAudit>>;

export type FinalizeTeamPlayer = {
  player_id: string;
  name: string;
  rank: number;
  points: number;
  gender: string | null;
};

export type FinalizeTeamWinner = {
  key: string;
  total_points: number;
  players: FinalizeTeamPlayer[];
  ranking_snapshot: TeamRankingAudit;
};

export type FinalizeTeamPrize = {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  winner_institution: FinalizeTeamWinner | null;
};

export type FinalizeTeamGroup = {
  group_id: string;
  prizes: FinalizeTeamPrize[];
  ranking_issues: string[];
};

export type TeamFinalizePreflight =
  | { ok: true; groups: FinalizeTeamGroup[] }
  | { ok: false; reason: 'invalid_preview' | 'unresolved_ranking' };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validWinner = (raw: unknown): raw is FinalizeTeamWinner =>
  record(raw) &&
  typeof raw.key === 'string' && raw.key.trim().length > 0 &&
  typeof raw.total_points === 'number' && Number.isFinite(raw.total_points) &&
  Array.isArray(raw.players) && raw.players.length > 0 &&
  raw.players.every(player =>
    record(player) &&
    typeof player.player_id === 'string' && player.player_id.length > 0 &&
    typeof player.name === 'string' &&
    typeof player.rank === 'number' && Number.isFinite(player.rank) &&
    typeof player.points === 'number' && Number.isFinite(player.points) &&
    (player.gender === null || typeof player.gender === 'string'),
  );

/** A server-computed audit must agree with the award and its selected roster. */
function validRankingSnapshot(raw: unknown, groupId: string, prize: Record<string, unknown>, winner: FinalizeTeamWinner): boolean {
  if (!record(raw) || raw.schema_version !== 2 || raw.group_id !== groupId ||
      raw.winner_key !== winner.key || !record(raw.award) ||
      raw.award.id !== prize.id || raw.award.place !== prize.place ||
      raw.award.cash_amount !== prize.cash_amount ||
      raw.award.has_trophy !== prize.has_trophy || raw.award.has_medal !== prize.has_medal ||
      !record(raw.group_rule) || !Number.isSafeInteger(raw.group_rule.team_size) ||
      !Array.isArray(raw.candidates) || raw.candidates.length === 0 ||
      !Array.isArray(raw.partitions) || raw.partitions.length === 0) return false;

  if (raw.declared_rules !== null && parseTeamRankingRuleConfig(raw.declared_rules) === null) return false;
  if (raw.declared_rules === null && raw.decided_by_criterion !== 'total_points') return false;

  const keys = new Set<string>();
  let selected: Array<Record<string, unknown>> | null = null;
  for (const item of raw.candidates) {
    if (!record(item) || typeof item.key !== 'string' || !item.key || keys.has(item.key) ||
        !Array.isArray(item.selected_players) || item.selected_players.length !== raw.group_rule.team_size) return false;
    keys.add(item.key);
    const ids = new Set<string>();
    for (const player of item.selected_players) {
      if (!record(player) || typeof player.player_id !== 'string' || !player.player_id ||
          ids.has(player.player_id) || typeof player.points !== 'number' || !Number.isFinite(player.points) ||
          (player.source_hash !== null && typeof player.source_hash !== 'string') ||
          !record(player.individual_tbs) ||
          Object.values(player.individual_tbs).some(tb => tb !== null && (typeof tb !== 'number' || !Number.isFinite(tb)))) return false;
      ids.add(player.player_id);
    }
    if (item.key === winner.key) selected = item.selected_players as Array<Record<string, unknown>>;
  }
  if (!selected || selected.length !== winner.players.length ||
      selected.some((item, i) => item.player_id !== winner.players[i].player_id ||
        item.points !== winner.players[i].points)) return false;

  const rankedKeys = new Set<string>();
  let winnerResolved = false;
  for (const partition of raw.partitions) {
    if (!record(partition) || !Array.isArray(partition.team_keys) ||
        !['resolved', 'tied', 'blocked'].includes(String(partition.status))) return false;
    if (partition.status === 'resolved' && partition.team_keys.length !== 1) return false;
    for (const key of partition.team_keys) {
      if (typeof key !== 'string' || !keys.has(key) || rankedKeys.has(key)) return false;
      rankedKeys.add(key);
      if (key === winner.key && partition.status === 'resolved' &&
          partition.criterion === raw.decided_by_criterion) winnerResolved = true;
    }
  }
  return rankedKeys.size === keys.size && winnerResolved;
}

/** Fails closed on old/malformed allocator responses or any unadjudicated prize hold. */
export function verifyTeamFinalizePreview(raw: unknown, expectedGroupCount: number): TeamFinalizePreflight {
  if (!Number.isSafeInteger(expectedGroupCount) || expectedGroupCount < 1 ||
      !record(raw) || !Array.isArray(raw.groups) || raw.groups.length !== expectedGroupCount) {
    return { ok: false, reason: 'invalid_preview' };
  }

  const seen = new Set<string>();
  for (const group of raw.groups) {
    if (!record(group) || typeof group.group_id !== 'string' || !group.group_id ||
        seen.has(group.group_id) || !Array.isArray(group.prizes) ||
        !Array.isArray(group.ranking_issues) ||
        !group.ranking_issues.every((issue: unknown) => typeof issue === 'string')) {
      return { ok: false, reason: 'invalid_preview' };
    }
    seen.add(group.group_id);
    if (group.ranking_issues.length > 0) {
      return { ok: false, reason: 'unresolved_ranking' };
    }
    for (const prize of group.prizes) {
      if (!record(prize) || typeof prize.id !== 'string' || !prize.id ||
          !Number.isSafeInteger(prize.place) || (prize.place as number) < 1 ||
          !('winner_institution' in prize) ||
          (prize.winner_institution !== null && (
            !validWinner(prize.winner_institution) ||
            !validRankingSnapshot(prize.winner_institution.ranking_snapshot, group.group_id, prize, prize.winner_institution)
          ))) {
        return { ok: false, reason: 'invalid_preview' };
      }
    }
  }

  return { ok: true, groups: raw.groups as FinalizeTeamGroup[] };
}
