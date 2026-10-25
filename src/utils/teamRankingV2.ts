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
