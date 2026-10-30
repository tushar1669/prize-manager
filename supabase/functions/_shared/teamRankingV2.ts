/**
 * Team Prize v2 deterministic comparison contract.
 *
 * PURE, not yet wired to the live allocator. Consumers MUST validate published
 * event rules and source import metadata server-side before treating a
 * criterion as verified. This module NEVER awards a prize, invents a missing
 * player score, or uses historical Rank Sum.
 */
export type TeamRankingCriterion =
  | { kind: 'score_vector' }
  | {
      kind: 'source_tb';
      ordinal: number;
      /** Verified event-defined meaning, e.g. "Buchholz Cut-1"; never inferred from TB1. */
      name: string;
      /** Only explicitly authorized team SUM rules are currently supported. */
      aggregation: 'sum';
      direction: 'higher' | 'lower';
      /** Must be established from the event's published rules outside this module. */
      verified: boolean;
    };

export type TeamRankingPlayer = {
  points: number | null;
  /** Source file provenance for the individual imported TB values. */
  sourceHash?: string | null;
  /** Indexed by source ordinal. Absent is NOT zero. */
  individualTieBreaks?: Record<number, number | null | undefined>;
};

export type TeamRankingCandidate = {
  key: string;
  /** Exact K players already chosen by the existing slot/rank eligibility logic. */
  selectedPlayers: TeamRankingPlayer[];
};

export type TeamRankingComparison =
  | { status: 'decided'; order: -1 | 1; criterion: 'total_points' | 'score_vector' | `TB${number}`; aValue: number | number[]; bValue: number | number[] }
  | { status: 'tied'; order: 0 }
  | { status: 'blocked'; order: 0; criterion: string; reason: 'invalid_team_size' | 'missing_points' | 'duplicate_criterion' | 'invalid_criterion' | 'undefined_tb' | 'missing_tb' };


/** The organizer's editable, versioned Team Prize rule order. */
export type TeamRankingRuleConfig = {
  version: 2;
  source_hash: string | null;
  published_reference: string;
  organizer_confirmed: boolean;
  criteria: TeamRankingCriterion[];
};

/** Strict parser shared by the organizer UI and the server allocator. */
export function parseTeamRankingRuleConfig(raw: unknown): TeamRankingRuleConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (item.version !== 2 || !Array.isArray(item.criteria)) return null;
  const criteria: TeamRankingCriterion[] = [];
  const seen = new Set<string>();
  for (const entry of item.criteria) {
    if (!entry || typeof entry !== 'object') return null;
    const rule = entry as Record<string, unknown>;
    const identifier = rule.kind === 'score_vector'
      ? 'score_vector'
      : rule.kind === 'source_tb' && typeof rule.ordinal === 'number' &&
        Number.isSafeInteger(rule.ordinal) && rule.ordinal >= 1
        ? `TB${rule.ordinal}`
        : null;
    if (!identifier || seen.has(identifier)) return null;
    seen.add(identifier);
    if (rule.kind === 'score_vector') {
      criteria.push({ kind: 'score_vector' });
    } else {
      if (rule.aggregation !== 'sum' ||
          (rule.direction !== 'higher' && rule.direction !== 'lower') ||
          typeof rule.name !== 'string' || typeof rule.verified !== 'boolean') return null;
      criteria.push({
        kind: 'source_tb',
        ordinal: Number(rule.ordinal),
        name: rule.name,
        aggregation: 'sum',
        direction: rule.direction,
        verified: rule.verified,
      });
    }
  }
  if (!seen.has('score_vector')) return null;
  return {
    version: 2,
    source_hash: typeof item.source_hash === 'string' ? item.source_hash : null,
    published_reference: typeof item.published_reference === 'string' ? item.published_reference : '',
    organizer_confirmed: item.organizer_confirmed === true,
    criteria,
  };
}

export type TeamRankingPartition = {
  teams: TeamRankingCandidate[];
  status: 'resolved' | 'tied' | 'blocked';
  criterion?: string;
  reason?: string;
};

/**
 * Produce ordered tie partitions, not an unsafe total-order sort. A missing TB
 * can block a tied subset without making an unrelated higher-score team lose.
 * The caller MUST never assign different prize places within tied/blocked sets.
 */
export function rankTeamCandidatesV2(
  candidates: readonly TeamRankingCandidate[],
  config: TeamRankingRuleConfig | null,
): TeamRankingPartition[] {
  if (!candidates.length) return [];
  const invalid = candidates.some(team =>
    team.selectedPlayers.length === 0 ||
    team.selectedPlayers.some(player =>
      typeof player.points !== 'number' || !Number.isFinite(player.points),
    ),
  );
  const sameSize = candidates.every(team =>
    team.selectedPlayers.length === candidates[0].selectedPlayers.length,
  );
  if (invalid || !sameSize) {
    return [{ teams: [...candidates], status: 'blocked', reason: invalid ? 'missing_points' : 'invalid_team_size' }];
  }

  // New payouts MUST have explicitly approved v2 regulations. Previously
  // unique Total Points groups were resolved without checking rules, making
  // obsolete/null legacy configurations look like authorized cash awards.
  // Historical SAVED versions are unaffected; only fresh scorer results hold.
  if (!config?.organizer_confirmed || !config.published_reference.trim()) {
    return [{ teams: [...candidates], status: 'blocked', reason: 'unapproved_rules' }];
  }

  const groups = new Map<number, TeamRankingCandidate[]>();
  for (const team of candidates) {
    const score = team.selectedPlayers.reduce((sum, player) => sum + (player.points as number), 0);
    if (!Number.isFinite(score)) return [{ teams: [...candidates], status: 'blocked', reason: 'missing_points' }];
    groups.set(score, [...(groups.get(score) ?? []), team]);
  }
  const totalsDescending = [...groups.keys()].sort((a, b) => b - a);

  const refine = (
    subset: TeamRankingCandidate[], index: number, decidedBy: string,
  ): TeamRankingPartition[] => {
    if (subset.length === 1) return [{ teams: subset, status: 'resolved', criterion: decidedBy }];
    if (!config?.organizer_confirmed || !config.published_reference.trim()) {
      return [{ teams: subset, status: 'blocked', reason: 'unapproved_rules' }];
    }
    if (index >= config.criteria.length) return [{ teams: subset, status: 'tied' }];
    const criterion = config.criteria[index];
    const label = criterion.kind === 'score_vector' ? 'score_vector' : `TB${criterion.ordinal}`;

    if (criterion.kind === 'source_tb' && (!criterion.verified || !criterion.name.trim())) {
      return [{ teams: subset, status: 'blocked', criterion: label, reason: 'undefined_tb' }];
    }

    const values: Array<{ team: TeamRankingCandidate; vector: number[]; scalar: number }> = [];
    for (const team of subset) {
      const vector = criterion.kind === 'score_vector'
        ? team.selectedPlayers.map(p => p.points as number).sort((a, b) => b - a)
        : [];
      const tbValues = criterion.kind === 'source_tb' ? team.selectedPlayers.map(p => {
        if (!config.source_hash || p.sourceHash !== config.source_hash) return null;
        return p.individualTieBreaks?.[criterion.ordinal] ?? null;
      }) : [];
      if (tbValues.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
        return [{ teams: subset, status: 'blocked', criterion: label, reason: 'missing_tb' }];
      }
      const scalar = tbValues.reduce<number>((sum, value) => sum + (value as number), 0);
      if (!Number.isFinite(scalar)) {
        return [{ teams: subset, status: 'blocked', criterion: label, reason: 'missing_tb' }];
      }
      values.push({ team, vector, scalar });
    }

    const cmp = (a: typeof values[number], b: typeof values[number]) => {
      if (criterion.kind === 'source_tb') {
        return (a.scalar - b.scalar) * (criterion.direction === 'higher' ? -1 : 1);
      }
      for (let i = 0; i < a.vector.length; i++) {
        if (a.vector[i] !== b.vector[i]) return b.vector[i] - a.vector[i];
      }
      return 0;
    };

    values.sort(cmp);
    const partitions: TeamRankingCandidate[][] = [];
    for (const entry of values) {
      const current = partitions[partitions.length - 1];
      if (!current || cmp(values.find(v => v.team === current[0])!, entry) !== 0) {
        partitions.push([entry.team]);
      } else {
        current.push(entry.team);
      }
    }
    return partitions.flatMap(part => refine(part, index + 1, label));
  };

  return totalsDescending.flatMap(total => refine(groups.get(total)!, 0, 'total_points'));
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const scoreVector = (team: TeamRankingCandidate): number[] =>
  team.selectedPlayers.map(player => player.points as number).sort((a, b) => b - a);

function sortNumber(a: number, b: number): -1 | 0 | 1 {
  return a > b ? -1 : a < b ? 1 : 0;
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Checks exactly two teams of equal eligible roster size. Each criterion is
 * applied only if all earlier stages failed to resolve the tie.
 *
 * Tie status does not assign a distinct rank or allow a cash prize to be
 * finalized; callers must provide regulated adjudication separately.
 */
export function compareTeamRankingV2(
  a: TeamRankingCandidate,
  b: TeamRankingCandidate,
  subsequentCriteria: readonly TeamRankingCriterion[],
): TeamRankingComparison {
  if (a.selectedPlayers.length === 0 || a.selectedPlayers.length !== b.selectedPlayers.length) {
    return { status: 'blocked', order: 0, criterion: 'total_points', reason: 'invalid_team_size' };
  }
  if ([...a.selectedPlayers, ...b.selectedPlayers].some(player => !finite(player.points))) {
    return { status: 'blocked', order: 0, criterion: 'total_points', reason: 'missing_points' };
  }

  const vectorA = scoreVector(a);
  const vectorB = scoreVector(b);
  const totalA = total(vectorA);
  const totalB = total(vectorB);
  if (!finite(totalA) || !finite(totalB)) {
    return { status: 'blocked', order: 0, criterion: 'total_points', reason: 'missing_points' };
  }
  const primaryOrder = sortNumber(totalA, totalB);
  if (primaryOrder) return { status: 'decided', order: primaryOrder, criterion: 'total_points', aValue: totalA, bValue: totalB };

  const seen = new Set<string>();
  for (const criterion of subsequentCriteria) {
    const identifier = criterion.kind === 'score_vector' ? 'score_vector' : `TB${criterion.ordinal}`;
    if (seen.has(identifier)) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'duplicate_criterion' };
    }
    seen.add(identifier);

    if (criterion.kind === 'score_vector') {
      for (let i = 0; i < vectorA.length; i++) {
        const cmp = sortNumber(vectorA[i], vectorB[i]);
        if (cmp) {
          return { status: 'decided', order: cmp, criterion: 'score_vector', aValue: vectorA, bValue: vectorB };
        }
      }
      continue;
    }

    if (!Number.isSafeInteger(criterion.ordinal) || criterion.ordinal < 1) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'invalid_criterion' };
    }
    if (!criterion.verified) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'undefined_tb' };
    }
    if (!criterion.name.trim()) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'invalid_criterion' };
    }
    const rowsA = a.selectedPlayers.map(player => player.individualTieBreaks?.[criterion.ordinal]);
    const rowsB = b.selectedPlayers.map(player => player.individualTieBreaks?.[criterion.ordinal]);
    if ([...rowsA, ...rowsB].some(value => !finite(value))) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'missing_tb' };
    }
    const tbA = total(rowsA as number[]);
    const tbB = total(rowsB as number[]);
    if (!finite(tbA) || !finite(tbB)) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'missing_tb' };
    }
    const cmp = sortNumber(tbA, tbB) * (criterion.direction === 'higher' ? 1 : -1);
    if (cmp) {
      return { status: 'decided', order: cmp as -1 | 1, criterion: identifier as `TB${number}`, aValue: tbA, bValue: tbB };
    }
  }
  return { status: 'tied', order: 0 };
}

/** Default eligible tie-break order: score vector, TB1…TBn; total is always fixed first. */
export function defaultTeamRankingCriteria(
  sourceOrdinals: readonly number[],
): TeamRankingCriterion[] {
  return [
    { kind: 'score_vector' },
    ...[...new Set(sourceOrdinals)]
      .filter(ordinal => Number.isSafeInteger(ordinal) && ordinal > 0)
      .sort((a, b) => a - b)
      .map(ordinal => ({
        kind: 'source_tb' as const,
        ordinal,
        name: '',
        aggregation: 'sum' as const,
        direction: 'higher' as const,
        verified: false,
      })),
  ];
}
