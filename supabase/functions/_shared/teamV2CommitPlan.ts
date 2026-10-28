import type { TeamRankingPartition } from './teamRankingV2.ts';
import type { TeamRulingRecord } from './teamTieAdjudicationV2.ts';

/**
 * Build an award PLACEMENT PLAN from fresh server-ranked partitions.
 * This is intentionally NOT a payout, DB write, or authorization boundary.
 * Callers must use server-fetched prizes, recompute the scorer, validate every
 * ruling using validateTeamRulingV2, and re-check source/version atomically
 * before persisting. Never construct this plan from browser-supplied rankings.
 */
export type V2PrizePlace = { id: string; place: number };
export type V2PlannedAward = {
  prize_id: string;
  group_id: string;
  place: number;
  institution_key: string;
  /** Attribution only; never awards cash or makes a payout. */
  decided_by: string;
};
export type V2CommitPlanResult =
  | { ok: true; awards: V2PlannedAward[] }
  | { ok: false; reason: 'invalid_inputs' | 'blocked_ranking' | 'missing_ruling' |
    'invalid_ruling' | 'duplicate_award' };

const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length && new Set(b).size === b.length &&
  a.every(key => b.includes(key));

/**
 * Do NOT allow alphabetic or legacy rank_sum ordering to award tied places.
 * Each fully exhausted prize-bearing partition needs an exact authorized
 * ruling for its own affected places, even if other partitions are resolved.
 *
 * A tied partition outside configured prize places is not a payout dispute;
 * it stays without ranking, and no manual order is required for that partition.
 */
export function planTeamV2AwardPlaces(
  groupId: string,
  partitions: readonly TeamRankingPartition[],
  prizes: readonly V2PrizePlace[],
  authorizedRulings: readonly TeamRulingRecord[],
  newVersion: number,
): V2CommitPlanResult {
  if (!groupId || !positive(newVersion) || !Array.isArray(partitions) ||
      !Array.isArray(prizes) || !Array.isArray(authorizedRulings) ||
      prizes.some(prize => !prize.id || !positive(prize.place)) ||
      new Set(prizes.map(prize => prize.place)).size !== prizes.length ||
      new Set(prizes.map(prize => prize.id)).size !== prizes.length) {
    return { ok: false, reason: 'invalid_inputs' };
  }

  const allKeys = partitions.flatMap(partition => partition.teams.map(team => team.key));
  if (!allKeys.length || new Set(allKeys).size !== allKeys.length ||
      allKeys.some(key => !key || typeof key !== 'string') ||
      partitions.some(partition =>
        !['resolved', 'tied', 'blocked'].includes(partition.status) ||
        partition.status === 'resolved' && partition.teams.length !== 1 ||
        partition.status === 'tied' && partition.teams.length < 2 ||
        partition.teams.length === 0)) return { ok: false, reason: 'invalid_inputs' };

  const sortedPrizes = [...prizes].sort((a, b) => a.place - b.place);
  const planned: V2PlannedAward[] = [];
  const usedRulings = new Set<TeamRulingRecord>();
  let previousSlots = 0;

  for (const partition of partitions) {
    const first = previousSlots + 1;
    const last = previousSlots + partition.teams.length;
    previousSlots = last;
    const targeted = sortedPrizes.filter(prize => prize.place >= first && prize.place <= last);
    if (!targeted.length) continue;

    if (partition.status === 'blocked') return { ok: false, reason: 'blocked_ranking' };
    let ordered = partition.teams.map(team => team.key);
    let decidedBy = partition.criterion ?? 'total_points';

    if (partition.status === 'tied') {
      const matching = authorizedRulings.filter(ruling =>
        ruling.group_id === groupId &&
        ruling.allocation_version === newVersion &&
        ruling.schema_version === 2 &&
        ruling.supersedes_allocation_version === newVersion - 1 &&
        typeof ruling.actor_id === 'string' && !!ruling.actor_id.trim() &&
        typeof ruling.regulation_reference === 'string' && !!ruling.regulation_reference.trim() &&
        typeof ruling.arbiter_decision_reference === 'string' && !!ruling.arbiter_decision_reference.trim() &&
        typeof ruling.explanation === 'string' && !!ruling.explanation.trim() &&
        sameSet(ruling.tied_team_keys, ordered) &&
        ruling.affected_places.length === targeted.length &&
        ruling.affected_places.every((place, i) => place === targeted[i].place));
      if (!matching.length) return { ok: false, reason: 'missing_ruling' };
      if (matching.length !== 1 || usedRulings.has(matching[0]) ||
          !sameSet(matching[0].ordered_team_keys, ordered) ||
          matching[0].method !== 'documented_arbiter_ruling' ||
          matching[0].award_instructions.length !== targeted.length) {
        return { ok: false, reason: 'invalid_ruling' };
      }
      const ruling = matching[0];
      ordered = ruling.ordered_team_keys;
      const expected = targeted.map(prize => ({
        place: prize.place,
        institution_key: ordered[prize.place - first],
      }));
      if (!expected.every((award, i) =>
        award.place === ruling.award_instructions[i]?.place &&
        award.institution_key === ruling.award_instructions[i]?.institution_key)) {
        return { ok: false, reason: 'invalid_ruling' };
      }
      usedRulings.add(ruling);
      decidedBy = 'documented_arbiter_ruling';
    }

    for (const prize of targeted) {
      planned.push({
        prize_id: prize.id,
        group_id: groupId,
        place: prize.place,
        institution_key: ordered[prize.place - first],
        decided_by: decidedBy,
      });
    }
  }

  // No orphaned instructions (wrong group/version or a non-prize tie).
  if (usedRulings.size !== authorizedRulings.length) {
    return { ok: false, reason: 'invalid_ruling' };
  }
  if (new Set(planned.map(award => award.institution_key)).size !== planned.length ||
      new Set(planned.map(award => award.prize_id)).size !== planned.length) {
    return { ok: false, reason: 'duplicate_award' };
  }
  return { ok: true, awards: planned };
}

/**
 * Complete prize placement for ALL active prize-bearing groups. Callers must
 * independently fetch the active prizes from DB and re-score ranked groups on
 * the server. This pure helper is not a proof of their provenance or a DB write.
 */
export type V2ActivePrizeGroup = { group_id: string; prizes: readonly V2PrizePlace[] };
export type V2RankedGroup = { group_id: string; partitions: readonly TeamRankingPartition[] };

export function planCompleteTeamV2Awards(
  activeGroups: readonly V2ActivePrizeGroup[],
  rankedGroups: readonly V2RankedGroup[],
  rulings: readonly TeamRulingRecord[],
  newVersion: number,
): V2CommitPlanResult {
  if (!positive(newVersion) || !Array.isArray(activeGroups) ||
      !Array.isArray(rankedGroups) || !Array.isArray(rulings) ||
      activeGroups.some(g => !g?.group_id || !Array.isArray(g.prizes)) ||
      rankedGroups.some(g => !g?.group_id || !Array.isArray(g.partitions))) {
    return { ok: false, reason: 'invalid_inputs' };
  }
  const ids = activeGroups.map(g => g.group_id);
  const active = activeGroups.filter(g => g.prizes.length > 0);
  const required = active.map(g => g.group_id);
  const scored = rankedGroups.map(g => g.group_id);
  if (new Set(ids).size !== ids.length ||
      !sameSet(required, scored) ||
      rulings.some(r => !r || !required.includes(r.group_id))) {
    return { ok: false, reason: 'invalid_inputs' };
  }
  const prizeIds = active.flatMap(g => g.prizes.map(p => p.id));
  if (new Set(prizeIds).size !== prizeIds.length) {
    return { ok: false, reason: 'duplicate_award' };
  }
  const awards: V2PlannedAward[] = [];
  for (const group of active) {
    const ranking = rankedGroups.find(g => g.group_id === group.group_id);
    if (!ranking) return { ok: false, reason: 'invalid_inputs' };
    const result = planTeamV2AwardPlaces(
      group.group_id, ranking.partitions, group.prizes,
      rulings.filter(r => r.group_id === group.group_id), newVersion,
    );
    if (!result.ok) return result;
    awards.push(...result.awards);
  }
  if (new Set(awards.map(a => a.prize_id)).size !== awards.length) {
    return { ok: false, reason: 'duplicate_award' };
  }
  return { ok: true, awards };
}
