import type { TeamRankingPartition } from './teamRankingV2.ts';

/**
 * Source-only validation seam for a FUTURE server-authoritative Team Ranking v2
 * ruling. Never call the legacy resolve_team_tie RPC with these instructions:
 * that RPC replaces existing versioned allocations with client-supplied rows.
 *
 * The context MUST come from the authenticated server (owner/master check,
 * latest version lookup and fresh scorer), never from the request body.
 * This helper neither awards money nor writes data.
 */
export type TeamRulingServerContext = {
  groupId: string;
  currentAllocationVersion: number;
  nextAllocationVersion: number;
  actorId: string | null;
  actorIsOwnerOrMaster: boolean;
  regulationsAttested: boolean;
  recordedAt: string;
  /** Fresh rankTeamCandidatesV2 output, not UI-supplied result order. */
  partitions: readonly TeamRankingPartition[];
  /** Current active prize places in this group (may have gaps). */
  prizePlaces: readonly number[];
};

export type TeamRulingRecord = {
  schema_version: 2;
  group_id: string;
  allocation_version: number;
  supersedes_allocation_version: number;
  actor_id: string;
  recorded_at: string;
  method: 'documented_arbiter_ruling';
  regulation_reference: string;
  arbiter_decision_reference: string;
  explanation: string;
  tied_team_keys: string[];
  ordered_team_keys: string[];
  affected_places: number[];
  award_instructions: { place: number; institution_key: string }[];
};

export type TeamRulingCheck =
  | { ok: true; record: TeamRulingRecord }
  | { ok: false; reason: 'unauthorized' | 'invalid_context' | 'stale_version' |
    'not_a_tie' | 'incomplete_ranking' | 'incorrect_boundary' | 'invalid_ruling' };

const obj = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const exactKeys = (raw: unknown, keys: readonly string[]): raw is string[] =>
  Array.isArray(raw) && raw.length === keys.length &&
  raw.every(key => typeof key === 'string' && key.length > 0) &&
  new Set(raw).size === raw.length &&
  raw.every(key => keys.includes(key));

/**
 * Only a real still-tied scorer partition touching a defined prize boundary
 * can become a proposed, versioned arbiter ruling. Missing TB source data
 * ('blocked') is NOT automatically an authorized tie decision.
 */
export function validateTeamRulingV2(
  proposal: unknown,
  ctx: TeamRulingServerContext,
): TeamRulingCheck {
  if (!ctx.actorIsOwnerOrMaster || !nonempty(ctx.actorId, 128)) {
    return { ok: false, reason: 'unauthorized' };
  }
  if (!ctx.regulationsAttested || !nonempty(ctx.groupId, 128) ||
      !Number.isSafeInteger(ctx.currentAllocationVersion) || ctx.currentAllocationVersion < 0 ||
      !positive(ctx.nextAllocationVersion) ||
      !nonempty(ctx.recordedAt, 40) || !Number.isFinite(Date.parse(ctx.recordedAt)) ||
      !Array.isArray(ctx.partitions) || !Array.isArray(ctx.prizePlaces) ||
      ctx.prizePlaces.some(place => !positive(place)) ||
      new Set(ctx.prizePlaces).size !== ctx.prizePlaces.length) {
    return { ok: false, reason: 'invalid_context' };
  }
  if (!obj(proposal) || proposal.group_id !== ctx.groupId ||
      !positive(proposal.next_allocation_version) ||
      proposal.next_allocation_version !== ctx.nextAllocationVersion ||
      ctx.nextAllocationVersion !== ctx.currentAllocationVersion + 1) {
    return { ok: false, reason: 'stale_version' };
  }
  if (ctx.partitions.some(p => p.status === 'blocked')) {
    return { ok: false, reason: 'incomplete_ranking' };
  }

  if (proposal.method !== 'documented_arbiter_ruling' ||
      !nonempty(proposal.regulation_reference, 300) ||
      !nonempty(proposal.arbiter_decision_reference, 300) ||
      !nonempty(proposal.explanation, 1600)) {
    return { ok: false, reason: 'invalid_ruling' };
  }

  // Require every institution exactly once across fresh scorer partitions.
  const allKeys = ctx.partitions.flatMap(p => p.teams.map(team => team.key));
  if (!allKeys.length || allKeys.some(key => !nonempty(key, 300)) ||
      new Set(allKeys).size !== allKeys.length ||
      ctx.partitions.some(p => p.status === 'resolved' && p.teams.length !== 1 ||
        p.status === 'tied' && p.teams.length < 2)) {
    return { ok: false, reason: 'invalid_context' };
  }

  // Never let arbitrary ordering choose which 'tied' partition is adjudicated.
  const partition = ctx.partitions.find(p =>
    p.status === 'tied' && exactKeys(proposal.tied_team_keys, p.teams.map(team => team.key)));
  if (!partition) return { ok: false, reason: 'not_a_tie' };
  const tiedKeys = partition.teams.map(team => team.key);
  if (!exactKeys(proposal.ordered_team_keys, tiedKeys)) {
    return { ok: false, reason: 'invalid_ruling' };
  }

  const start = ctx.partitions
    .slice(0, ctx.partitions.indexOf(partition))
    .reduce((count, p) => count + p.teams.length, 0);
  const affected = ctx.prizePlaces
    .filter(place => place > start && place <= start + tiedKeys.length)
    .sort((a, b) => a - b);
  const requested = proposal.affected_places;
  if (!affected.length || !Array.isArray(requested) ||
      requested.length !== affected.length ||
      !requested.every((place: unknown, i: number) => place === affected[i])) {
    return { ok: false, reason: 'incorrect_boundary' };
  }

  const order = proposal.ordered_team_keys as string[];
  const awards = affected.map(place => ({
    place, institution_key: order[place - start - 1],
  }));
  return {
    ok: true,
    record: {
      schema_version: 2,
      group_id: ctx.groupId,
      // These are NEW-version instructions only. Never update prior rows.
      allocation_version: ctx.nextAllocationVersion,
      supersedes_allocation_version: ctx.currentAllocationVersion,
      actor_id: ctx.actorId!,
      recorded_at: ctx.recordedAt,
      method: 'documented_arbiter_ruling',
      regulation_reference: (proposal.regulation_reference as string).trim(),
      arbiter_decision_reference: (proposal.arbiter_decision_reference as string).trim(),
      explanation: (proposal.explanation as string).trim(),
      tied_team_keys: [...tiedKeys],
      ordered_team_keys: [...order],
      affected_places: [...affected],
      award_instructions: awards,
    },
  };
}
