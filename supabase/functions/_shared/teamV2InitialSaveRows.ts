import { hasCompleteInitialTeamV2IndividualPreview } from './teamV2IndividualPreview.ts';
import { verifyTeamV2ReviewPrizeInventory } from './teamV2ReviewPrizeInventory.ts';
import { verifyTeamFinalizePreview } from './teamFinalizeGuard.ts';
import { parseTeamRankingRuleConfig } from './teamRankingV2.ts';

/**
 * First-version, UNCONTESTED Team v2 only. Browser-supplied awards never enter
 * this function. All four arguments must be loaded independently by a private,
 * authenticated Edge caller. This is not a transactional source-freshness proof.
 */
export type ActiveTeamV2Group = {
  id: string; group_by: string; team_size: number;
  female_slots: number; male_slots: number; scoring_mode: string;
  ranking_rules: unknown;
};
export type ActiveTeamV2Prize = {
  id: string; group_id: string; place: number;
  cash_amount: number; has_trophy: boolean; has_medal: boolean;
};
export type InitialTeamV2Rows = {
  individual_rows: Array<{ prize_id: string; player_id: string | null;
    reason_codes: string[]; is_manual: boolean }>;
  team_rows: Array<{ group_id: string; prize_id: string; place: number;
    institution_key: string; total_points: number; player_ids: string[];
    player_snapshot: Array<{ player_id: string; points: number }>;
    ranking_snapshot: Record<string, unknown> }>;
  rulings: [];
};
type Result = { ok: true; rows: InitialTeamV2Rows } |
  { ok: false; reason: 'invalid_source' | 'incomplete_individual_awards' |
    'unresolved_team_awards' | 'ranking_contract_mismatch' };
const obj = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function prepareInitialUncontestedTeamV2Rows(
  individualPrizeIds: readonly string[], individualPreview: unknown,
  dbGroups: readonly ActiveTeamV2Group[], dbPrizes: readonly ActiveTeamV2Prize[],
  teamPreview: unknown, actorId: string, newVersion = 1,
): Result {
  if (!actorId || !Number.isSafeInteger(newVersion) || newVersion < 1 ||
      !Array.isArray(dbGroups) || !dbGroups.length ||
      !Array.isArray(dbPrizes) || !dbPrizes.length ||
      !obj(teamPreview) || !Array.isArray(teamPreview.groups) ||
      !verifyTeamV2ReviewPrizeInventory(dbGroups, dbPrizes, teamPreview.groups)) {
    return { ok: false, reason: 'invalid_source' };
  }
  if (!hasCompleteInitialTeamV2IndividualPreview(individualPrizeIds, individualPreview) ||
      !obj(individualPreview) || !Array.isArray(individualPreview.winners) ||
      !Array.isArray(individualPreview.unfilled)) {
    // Reject masked/missing winners and invalid unfilled evidence. The SQL
    // writer must carry an explicit NULL-player row for each genuine unfilled
    // prize and insert only the real winners.
    return { ok: false, reason: 'incomplete_individual_awards' };
  }
  const validated = verifyTeamFinalizePreview(teamPreview, dbGroups.length);
  if (!validated.ok) return {
    ok: false,
    reason: validated.reason === 'unresolved_ranking'
      ? 'unresolved_team_awards' : 'invalid_source',
  };
  const groupMap = new Map(dbGroups.map(group => [group.id, group]));
  const rows: InitialTeamV2Rows['team_rows'] = [];
  for (const group of teamPreview.groups) {
    if (!obj(group) || typeof group.group_id !== 'string' ||
        !Array.isArray(group.prizes) || !Array.isArray(group.adjudication_partitions) ||
        !Array.isArray(group.adjudication_ties) || group.adjudication_ties.length ||
        group.adjudication_partitions.some(part =>
          !obj(part) || part.status !== 'resolved' ||
          !Array.isArray(part.teams) || part.teams.length !== 1)) {
      return { ok: false, reason: 'unresolved_team_awards' };
    }
    const current = groupMap.get(group.group_id);
    if (!current) return { ok: false, reason: 'invalid_source' };
    const rules = parseTeamRankingRuleConfig(current.ranking_rules);
    if (!rules?.organizer_confirmed || !rules.published_reference.trim() ||
        !same(rules, current.ranking_rules) ||
        group.adjudication_rules_reference !== rules.published_reference ||
        !obj(group.config) ||
        !same(group.config, {
          group_by: current.group_by, team_size: current.team_size,
          female_slots: current.female_slots, male_slots: current.male_slots,
          scoring_mode: current.scoring_mode,
        })) return { ok: false, reason: 'ranking_contract_mismatch' };
    for (const prize of group.prizes) {
      if (!obj(prize) || !obj(prize.winner_institution) ||
          !obj(prize.winner_institution.ranking_snapshot) ||
          prize.winner_institution.ranking_snapshot.schema_version !== 2 ||
          !same(prize.winner_institution.ranking_snapshot.declared_rules, rules) ||
          !Array.isArray(prize.winner_institution.players) ||
          prize.winner_institution.players.length !== current.team_size ||
          !Number.isFinite(prize.winner_institution.total_points)) {
        return { ok: false, reason: 'unresolved_team_awards' };
      }
      const winner = prize.winner_institution;
      // A valid roster/audit is not enough: its resolved rank must own this
      // exact money-bearing place. Never pay a lower team from a swapped
      // scorer response or infer an arbitrary order from a prize ID.
      const rankedSlots = group.adjudication_partitions.flatMap(part =>
        part.teams.map(team => team.key));
      if (typeof winner.key !== 'string' ||
          rankedSlots[prize.place - 1] !== winner.key) {
        return { ok: false, reason: 'ranking_contract_mismatch' };
      }
      const players = winner.players;
      const names = new Set<string>();
      const snapshot: Array<{ player_id: string; points: number }> = [];
      for (const player of players) {
        if (!obj(player) || typeof player.player_id !== 'string' ||
            !player.player_id || names.has(player.player_id) ||
            typeof player.points !== 'number' || !Number.isFinite(player.points)) {
          return { ok: false, reason: 'invalid_source' };
        }
        names.add(player.player_id);
        snapshot.push({ player_id: player.player_id, points: player.points });
      }
      const total = snapshot.reduce((sum, player) => sum + player.points, 0);
      if (Math.abs(total - Number(winner.total_points)) > 1e-8)
        return { ok: false, reason: 'invalid_source' };
      rows.push({
        group_id: group.group_id, prize_id: prize.id as string,
        place: prize.place as number, institution_key: winner.key as string,
        total_points: winner.total_points as number,
        player_ids: snapshot.map(player => player.player_id),
        player_snapshot: snapshot,
        ranking_snapshot: {
          ...winner.ranking_snapshot,
          allocation_version: newVersion, finalized_by: actorId,
          // No fabricated official adjudication for resolved partitions.
        },
      });
    }
  }
  if (rows.length !== dbPrizes.length ||
      new Set(rows.map(r => r.prize_id)).size !== rows.length) {
    return { ok: false, reason: 'unresolved_team_awards' };
  }
  const winners = individualPreview.winners as Array<Record<string, unknown>>;
  const unfilled = individualPreview.unfilled as Array<Record<string, unknown>>;
  return { ok: true, rows: {
    individual_rows: [
      ...winners.map(winner => ({
        prize_id: winner.prizeId as string,
        player_id: winner.playerId as string,
        reason_codes: winner.reasons as string[],
        is_manual: winner.isManual as boolean,
      })),
      // SQL counts this explicit non-winner towards exact prize coverage, but
      // NEVER inserts it as an allocation or invents a recipient.
      ...unfilled.map(entry => ({
        prize_id: entry.prizeId as string, player_id: null,
        reason_codes: entry.reasonCodes as string[], is_manual: false,
      })),
    ],
    team_rows: rows, rulings: [],
  } };
}
