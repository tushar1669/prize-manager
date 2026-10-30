import { hasCompleteInitialTeamV2IndividualPreview } from './teamV2IndividualPreview.ts';
import { verifyTeamV2ReviewPrizeInventory } from './teamV2ReviewPrizeInventory.ts';
import { parseTeamRankingRuleConfig, type TeamRankingPartition } from './teamRankingV2.ts';
import { buildTeamRankingAwardAudit } from './teamRankingAudit.ts';
import { planAuthorizedTeamV2Awards, type V2AuthorizedActor,
  type V2AuthorizedRulingProposal, type V2AuthorizedServerGroup } from './teamV2CommitPlan.ts';
import type { ActiveTeamV2Group, ActiveTeamV2Prize,
  InitialTeamV2Rows } from './teamV2InitialSaveRows.ts';

const obj = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Result =
  | { ok: true; rows: { individual_rows: InitialTeamV2Rows['individual_rows'];
    team_rows: InitialTeamV2Rows['team_rows']; rulings: unknown[] } }
  | { ok: false; reason: 'invalid_source' | 'incomplete_individual_awards' |
    'unapproved_rules' | 'invalid_roster' | 'invalid_ruling' | 'incomplete_awards' };
type Member = { player_id: string; name: string; rank: number; points: number;
  gender: string | null };
type Selected = { playerId: string; points: number; sourceHash: string | null;
  individualTieBreaks: Record<number, number | null> };
type ScorerTeam = { key: string; members: Member[]; selectedPlayers: Selected[] };

/**
 * Trusted-input-only assembler for a documented official tie. Called ONLY
 * after server JWT owner/master checks, full-access checks, and server-issued
 * scorer preview; the caller must recheck source fingerprint and version
 * inside the atomic RPC. No browser award rows/rosters enter here.
 */
export function prepareAdjudicatedTeamV2Rows(
  individualPrizeIds: readonly string[], individualPreview: unknown,
  dbGroups: readonly ActiveTeamV2Group[], dbPrizes: readonly ActiveTeamV2Prize[],
  teamPreview: unknown, proposedRulings: unknown, actor: V2AuthorizedActor,
): Result {
  if (!Array.isArray(dbGroups) || !Array.isArray(dbPrizes) ||
      !obj(teamPreview) || !Array.isArray(teamPreview.groups) ||
      !verifyTeamV2ReviewPrizeInventory(dbGroups, dbPrizes, teamPreview.groups) ||
      !Array.isArray(proposedRulings) || !proposedRulings.every(proposal =>
        obj(proposal) && typeof proposal.group_id === 'string' &&
        obj(proposal.proposal))) return { ok: false, reason: 'invalid_source' };
  if (!hasCompleteInitialTeamV2IndividualPreview(individualPrizeIds, individualPreview) ||
      !obj(individualPreview) || !Array.isArray(individualPreview.winners) ||
      !Array.isArray(individualPreview.unfilled)) {
    return { ok: false, reason: 'incomplete_individual_awards' };
  }

  const ranked: V2AuthorizedServerGroup[] = [];
  const rosterByGroup = new Map<string, Map<string, ScorerTeam>>();
  const configs = new Map<string, NonNullable<ReturnType<typeof parseTeamRankingRuleConfig>>>();
  for (const dbGroup of dbGroups) {
    const preview = teamPreview.groups.find((candidate: unknown) =>
      obj(candidate) && candidate.group_id === dbGroup.id);
    if (!obj(preview) || !obj(preview.config) ||
        !Array.isArray(preview.adjudication_partitions) ||
        preview.adjudication_rules_reference === undefined ||
        !same(preview.config, {
          group_by: dbGroup.group_by, team_size: dbGroup.team_size,
          female_slots: dbGroup.female_slots, male_slots: dbGroup.male_slots,
          scoring_mode: dbGroup.scoring_mode,
        })) return { ok: false, reason: 'invalid_source' };

    const rules = parseTeamRankingRuleConfig(dbGroup.ranking_rules);
    if (!rules?.organizer_confirmed || !rules.published_reference.trim() ||
        !same(rules, dbGroup.ranking_rules) ||
        preview.adjudication_rules_reference !== rules.published_reference) {
      return { ok: false, reason: 'unapproved_rules' };
    }
    configs.set(dbGroup.id, rules);
    const participants = new Map<string, ScorerTeam>();
    const partitions: TeamRankingPartition[] = [];
    for (const item of preview.adjudication_partitions) {
      if (!obj(item) || !['resolved','tied','blocked'].includes(String(item.status)) ||
          !Array.isArray(item.teams) || item.teams.length === 0 ||
          (item.status === 'resolved' && item.teams.length !== 1) ||
          (item.status === 'tied' && item.teams.length < 2)) {
        return { ok: false, reason: 'invalid_source' };
      }
      const teams = [];
      for (const raw of item.teams) {
        if (!obj(raw) || typeof raw.key !== 'string' || !raw.key.trim() ||
            participants.has(raw.key) || !Array.isArray(raw.members) ||
            !Array.isArray(raw.selectedPlayers) ||
            raw.members.length !== dbGroup.team_size ||
            raw.selectedPlayers.length !== dbGroup.team_size) {
          return { ok: false, reason: 'invalid_roster' };
        }
        const ids = new Set<string>();
        for (let i = 0; i < dbGroup.team_size; i++) {
          const m = raw.members[i], s = raw.selectedPlayers[i];
          if (!obj(m) || !obj(s) ||
              typeof s.playerId !== 'string' || !s.playerId ||
              ids.has(s.playerId) || m.player_id !== s.playerId ||
              typeof s.points !== 'number' || !Number.isFinite(s.points) ||
              m.points !== s.points ||
              typeof m.name !== 'string' ||
              typeof m.rank !== 'number' || !Number.isFinite(m.rank) ||
              (m.gender !== null && typeof m.gender !== 'string') ||
              (s.sourceHash !== null && typeof s.sourceHash !== 'string') ||
              !obj(s.individualTieBreaks) ||
              Object.values(s.individualTieBreaks).some(tb =>
                tb !== null && (typeof tb !== 'number' || !Number.isFinite(tb)))) {
            return { ok: false, reason: 'invalid_roster' };
          }
          ids.add(s.playerId);
        }
        participants.set(raw.key, raw as ScorerTeam);
        teams.push({ key: raw.key, selectedPlayers: raw.selectedPlayers as Selected[] });
      }
      partitions.push({
        status: item.status as TeamRankingPartition['status'],
        criterion: typeof item.criterion === 'string' ? item.criterion : undefined,
        reason: typeof item.reason === 'string' ? item.reason : undefined,
        teams,
      });
    }
    rosterByGroup.set(dbGroup.id, participants);
    const prizes = dbPrizes.filter(p => p.group_id === dbGroup.id);
    if (prizes.length) ranked.push({
      group_id: dbGroup.id, prizes: prizes.map(p => ({ id: p.id, place: p.place })),
      partitions, published_reference: rules.published_reference,
      organizer_confirmed: true,
    });
  }

  const planned = planAuthorizedTeamV2Awards(ranked,
    proposedRulings as V2AuthorizedRulingProposal[], actor);
  if (!planned.ok) return { ok: false, reason: 'invalid_ruling' };

  const results: InitialTeamV2Rows['team_rows'] = [];
  for (const award of planned.awards) {
    const dbGroup = dbGroups.find(g => g.id === award.group_id);
    const prize = dbPrizes.find(p => p.id === award.prize_id &&
      p.group_id === award.group_id && p.place === award.place);
    const ranking = ranked.find(g => g.group_id === award.group_id);
    const team = rosterByGroup.get(award.group_id)?.get(award.institution_key);
    const rules = configs.get(award.group_id);
    if (!dbGroup || !prize || !ranking || !team || !rules) {
      return { ok: false, reason: 'invalid_source' };
    }
    const candidates = ranking.partitions.flatMap(p => p.teams.map(t => ({
      key: t.key,
      selectedPlayers: t.selectedPlayers.map(s => ({
        ...s, playerId: s.playerId,
      })),
    })));
    const ruling = planned.rulings.find(r =>
      r.group_id === award.group_id &&
      r.award_instructions.some(a =>
        a.place === award.place && a.institution_key === award.institution_key));
    const audit = buildTeamRankingAwardAudit(
      dbGroup.id, {
        group_by: dbGroup.group_by, team_size: dbGroup.team_size,
        female_slots: dbGroup.female_slots, male_slots: dbGroup.male_slots,
        scoring_mode: dbGroup.scoring_mode,
      }, prize, award.institution_key, rules, candidates, ranking.partitions,
      ruling,
    );
    if (!audit || audit.decided_by_criterion !== award.decided_by) {
      return { ok: false, reason: 'invalid_ruling' };
    }
    results.push({
      group_id: award.group_id, prize_id: award.prize_id, place: award.place,
      institution_key: award.institution_key,
      total_points: team.selectedPlayers.reduce((sum, p) => sum + p.points, 0),
      player_ids: team.members.map(p => p.player_id),
      player_snapshot: team.members.map(p => ({
        player_id: p.player_id, points: p.points,
      })),
      ranking_snapshot: {
        ...audit,
        allocation_version: actor.currentAllocationVersion + 1,
        finalized_by: actor.actorId,
      },
    });
  }
  if (results.length !== dbPrizes.length ||
      new Set(results.map(row => row.prize_id)).size !== results.length) {
    return { ok: false, reason: 'incomplete_awards' };
  }

  return { ok: true, rows: {
    individual_rows: [
      ...individualPreview.winners.map((winner: Record<string, unknown>) => ({
        prize_id: winner.prizeId as string, player_id: winner.playerId as string,
        reason_codes: winner.reasons as string[], is_manual: winner.isManual as boolean,
      })),
      ...individualPreview.unfilled.map((entry: Record<string, unknown>) => ({
        prize_id: entry.prizeId as string, player_id: null,
        reason_codes: entry.reasonCodes as string[], is_manual: false,
      })),
    ],
    team_rows: results, rulings: planned.rulings,
  } };
}
