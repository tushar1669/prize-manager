/**
 * Team Prize v2 deterministic comparison contract.
 *
 * PURE, not yet wired to the live allocator. Consumers MUST validate published
 * event rules and source import metadata server-side before treating a
 * criterion as verified. This module NEVER awards a prize, invents a missing
 * player score, or uses historical Rank Sum.
 */
import { isNonSummableTieBreakName, tieBreakMethodFromSwissManagerCode } from './teamTieBreakMethods.ts';

export type TeamRankingCriterion =
  | { kind: 'score_vector' }
  /**
   * The team whose best-placed counted player has the better (lower) tournament
   * rank wins. Ranks are unique, so this step always decides between teams.
   */
  | { kind: 'best_rank' }
  /**
   * The individual tie-break columns of the imported Excel, in file order
   * (TB1, TB2, …), compared position by position: TB1 of each team's 1st
   * (best-ranked) counted player, then TB1 of the 2nd player, and so on; only
   * when TB1 is equal for every position does TB2 start again from the 1st
   * player. Higher wins. The columns are read from the tournament's current
   * import when prizes are allocated, so this step can be chosen before any
   * Excel is imported. Direct Encounter columns are skipped: a head-to-head
   * value cannot be compared between different players.
   */
  | { kind: 'imported_tbs' }
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
  /** Tournament rank (1 = best). Absent is NOT a rank. */
  rank?: number | null;
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
  | { status: 'decided'; order: -1 | 1; criterion: 'total_points' | 'score_vector' | 'best_rank' | 'imported_tbs' | `TB${number}`; aValue: number | number[]; bValue: number | number[] }
  | { status: 'tied'; order: 0 }
  | { status: 'blocked'; order: 0; criterion: string; reason: 'invalid_team_size' | 'missing_points' | 'duplicate_criterion' | 'invalid_criterion' | 'undefined_tb' | 'missing_tb' | 'missing_rank' | ImportedTieBreakUnavailableReason };

/** Why the tournament's imported tie-break columns cannot be used. */
export type ImportedTieBreakUnavailableReason = 'no_imported_tbs' | 'mixed_tb_sources';

/** One individual tie-break column of the imported Excel. */
export type ImportedTieBreakColumnRef = { ordinal: number; header: string };

/**
 * The tie-break columns of the tournament's current player import, read when
 * prizes are allocated (never from the saved rules). `sourceHash` identifies
 * the imported file; a player's values only count if they came from it.
 */
export type ImportedTieBreakContext =
  | { status: 'available'; sourceHash: string; columns: ImportedTieBreakColumnRef[] }
  | { status: 'unavailable'; reason: ImportedTieBreakUnavailableReason };

/** False for Direct Encounter style columns (DE, EDE, head-to-head). */
export function isComparableImportedTieBreak(header: string): boolean {
  return !isNonSummableTieBreakName(header) &&
    tieBreakMethodFromSwissManagerCode(header)?.summable !== false;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Columns of one player's saved `team_tiebreak_v2`, or null when malformed. */
function importedColumnsOf(raw: Record<string, unknown>): ImportedTieBreakColumnRef[] | null {
  if (!Array.isArray(raw.source_columns)) return null;
  const columns: ImportedTieBreakColumnRef[] = [];
  for (const item of raw.source_columns) {
    if (!record(item) || typeof item.ordinal !== 'number' || !Number.isSafeInteger(item.ordinal) ||
        item.ordinal < 1 || typeof item.header !== 'string') return null;
    // A duplicated position is ambiguous; its values are already saved as blank.
    if (!columns.some(column => column.ordinal === item.ordinal)) {
      columns.push({ ordinal: item.ordinal, header: item.header });
    }
  }
  return columns.sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * Work out the imported tie-break columns from the players' saved tags. A
 * player added by hand has none and is ignored here (its values are blank).
 * Players from two different imports, or with inconsistent column lists,
 * fail closed: nothing can be compared safely.
 */
export function importedTieBreakContextFromTags(tags: readonly unknown[]): ImportedTieBreakContext {
  let found: { sourceHash: string; columns: ImportedTieBreakColumnRef[]; signature: string } | null = null;
  for (const tag of tags) {
    if (!record(tag) || tag.team_tiebreak_v2 === undefined || tag.team_tiebreak_v2 === null) continue;
    const raw = tag.team_tiebreak_v2;
    // Values not tied to an imported file can never be compared (blank).
    if (record(raw) && raw.version === 1 && raw.source_hash === null) continue;
    if (!record(raw) || raw.version !== 1 || typeof raw.source_hash !== 'string' || !raw.source_hash) {
      return { status: 'unavailable', reason: 'mixed_tb_sources' };
    }
    const columns = importedColumnsOf(raw);
    if (!columns) return { status: 'unavailable', reason: 'mixed_tb_sources' };
    const signature = JSON.stringify(columns);
    if (!found) {
      found = { sourceHash: raw.source_hash, columns, signature };
    } else if (found.sourceHash !== raw.source_hash || found.signature !== signature) {
      return { status: 'unavailable', reason: 'mixed_tb_sources' };
    }
  }
  if (!found || found.columns.length === 0) return { status: 'unavailable', reason: 'no_imported_tbs' };
  return { status: 'available', sourceHash: found.sourceHash, columns: found.columns };
}

/** Strict reader for a context carried in a server-to-server scorer response. */
export function parseImportedTieBreakContext(raw: unknown): ImportedTieBreakContext | null {
  if (!record(raw)) return null;
  if (raw.status === 'unavailable') {
    return raw.reason === 'no_imported_tbs' || raw.reason === 'mixed_tb_sources'
      ? { status: 'unavailable', reason: raw.reason } : null;
  }
  if (raw.status !== 'available' || typeof raw.sourceHash !== 'string' || !raw.sourceHash) return null;
  const columns = importedColumnsOf({ source_columns: raw.columns });
  return columns && columns.length ? { status: 'available', sourceHash: raw.sourceHash, columns } : null;
}

/** Counted players in board order: best (lowest) tournament rank first. */
function boardOrder(players: readonly TeamRankingPlayer[]): TeamRankingPlayer[] | null {
  if (players.some(player => typeof player.rank !== 'number' || !Number.isFinite(player.rank))) return null;
  return [...players].sort((a, b) => (a.rank as number) - (b.rank as number));
}

/** A player's imported value; values saved from any other file never count. */
function importedValue(player: TeamRankingPlayer, ordinal: number, sourceHash: string): number | null {
  if (player.sourceHash !== sourceHash) return null;
  const value = player.individualTieBreaks?.[ordinal];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Stable identifier for a criterion: 'score_vector', 'best_rank', 'imported_tbs' or 'TB<n>'. */
export function teamCriterionId(criterion: TeamRankingCriterion): string {
  return criterion.kind === 'source_tb' ? `TB${criterion.ordinal}` : criterion.kind;
}


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
    const identifier = rule.kind === 'score_vector' || rule.kind === 'best_rank' || rule.kind === 'imported_tbs'
      ? rule.kind
      : rule.kind === 'source_tb' && typeof rule.ordinal === 'number' &&
        Number.isSafeInteger(rule.ordinal) && rule.ordinal >= 1
        ? `TB${rule.ordinal}`
        : null;
    if (!identifier || seen.has(identifier)) return null;
    seen.add(identifier);
    if (rule.kind === 'score_vector') {
      criteria.push({ kind: 'score_vector' });
    } else if (rule.kind === 'best_rank') {
      criteria.push({ kind: 'best_rank' });
    } else if (rule.kind === 'imported_tbs') {
      criteria.push({ kind: 'imported_tbs' });
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
  // Every step after Total Points is optional: an organizer may declare only
  // the steps the published regulations list (even none).
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
  importedTieBreaks?: ImportedTieBreakContext | null,
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
    const label = teamCriterionId(criterion);

    if (criterion.kind === 'imported_tbs') {
      if (importedTieBreaks?.status !== 'available') {
        return [{ teams: subset, status: 'blocked', criterion: label,
          reason: importedTieBreaks?.status === 'unavailable' ? importedTieBreaks.reason : 'no_imported_tbs' }];
      }
      const { sourceHash } = importedTieBreaks;
      const columns = importedTieBreaks.columns.filter(column => isComparableImportedTieBreak(column.header));
      if (!columns.length) return [{ teams: subset, status: 'blocked', criterion: label, reason: 'no_imported_tbs' }];
      const boards = new Map<TeamRankingCandidate, TeamRankingPlayer[]>();
      for (const team of subset) {
        const board = boardOrder(team.selectedPlayers);
        if (!board) return [{ teams: subset, status: 'blocked', criterion: label, reason: 'missing_rank' }];
        boards.set(team, board);
      }
      const positions = subset[0].selectedPlayers.length;
      // TB-major, player-minor: step s compares TB columns[s / positions] of
      // the player at board position s % positions. Teams split as soon as a
      // value differs; a blank holds only the group that needs that value.
      const byStep = (group: TeamRankingCandidate[], step: number): TeamRankingPartition[] => {
        if (group.length === 1 || step >= columns.length * positions) return refine(group, index + 1, label);
        const ordinal = columns[Math.floor(step / positions)].ordinal;
        const position = step % positions;
        const scored: Array<{ team: TeamRankingCandidate; value: number }> = [];
        for (const team of group) {
          const value = importedValue(boards.get(team)![position], ordinal, sourceHash);
          if (value === null) return [{ teams: group, status: 'blocked', criterion: label, reason: 'missing_tb' }];
          scored.push({ team, value });
        }
        scored.sort((a, b) => b.value - a.value);
        const parts: TeamRankingCandidate[][] = [];
        let previous: number | null = null;
        for (const entry of scored) {
          if (previous !== null && entry.value === previous) parts[parts.length - 1].push(entry.team);
          else parts.push([entry.team]);
          previous = entry.value;
        }
        return parts.flatMap(part => byStep(part, step + 1));
      };
      return byStep(subset, 0);
    }

    // A non-summable method (Direct Encounter) can be declared but never
    // decides a team prize by adding individual values: hold for a ruling.
    if (criterion.kind === 'source_tb' &&
        (!criterion.verified || !criterion.name.trim() || isNonSummableTieBreakName(criterion.name))) {
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
      let scalar = tbValues.reduce<number>((sum, value) => sum + (value as number), 0);
      if (!Number.isFinite(scalar)) {
        return [{ teams: subset, status: 'blocked', criterion: label, reason: 'missing_tb' }];
      }
      if (criterion.kind === 'best_rank') {
        const ranks = team.selectedPlayers.map(p => p.rank);
        if (ranks.some(rank => typeof rank !== 'number' || !Number.isFinite(rank))) {
          return [{ teams: subset, status: 'blocked', criterion: label, reason: 'missing_rank' }];
        }
        scalar = Math.min(...(ranks as number[]));
      }
      values.push({ team, vector, scalar });
    }

    const cmp = (a: typeof values[number], b: typeof values[number]) => {
      if (criterion.kind === 'source_tb') {
        return (a.scalar - b.scalar) * (criterion.direction === 'higher' ? -1 : 1);
      }
      // Best-placed counted player: the lower rank number wins.
      if (criterion.kind === 'best_rank') return a.scalar - b.scalar;
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
  importedTieBreaks?: ImportedTieBreakContext | null,
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
    const identifier = teamCriterionId(criterion);
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

    if (criterion.kind === 'best_rank') {
      const ranksA = a.selectedPlayers.map(player => player.rank);
      const ranksB = b.selectedPlayers.map(player => player.rank);
      if ([...ranksA, ...ranksB].some(rank => !finite(rank))) {
        return { status: 'blocked', order: 0, criterion: 'best_rank', reason: 'missing_rank' };
      }
      const bestA = Math.min(...(ranksA as number[]));
      const bestB = Math.min(...(ranksB as number[]));
      // sortNumber ranks the higher value first; a lower rank is better.
      const cmp = sortNumber(bestB, bestA);
      if (cmp) return { status: 'decided', order: cmp, criterion: 'best_rank', aValue: bestA, bValue: bestB };
      continue;
    }

    if (criterion.kind === 'imported_tbs') {
      if (importedTieBreaks?.status !== 'available') {
        return { status: 'blocked', order: 0, criterion: identifier,
          reason: importedTieBreaks?.status === 'unavailable' ? importedTieBreaks.reason : 'no_imported_tbs' };
      }
      const columns = importedTieBreaks.columns.filter(column => isComparableImportedTieBreak(column.header));
      if (!columns.length) return { status: 'blocked', order: 0, criterion: identifier, reason: 'no_imported_tbs' };
      const boardA = boardOrder(a.selectedPlayers);
      const boardB = boardOrder(b.selectedPlayers);
      if (!boardA || !boardB) return { status: 'blocked', order: 0, criterion: identifier, reason: 'missing_rank' };
      const keyA: number[] = [];
      const keyB: number[] = [];
      for (const column of columns) {
        for (let i = 0; i < boardA.length; i++) {
          const valueA = importedValue(boardA[i], column.ordinal, importedTieBreaks.sourceHash);
          const valueB = importedValue(boardB[i], column.ordinal, importedTieBreaks.sourceHash);
          if (valueA === null || valueB === null) {
            return { status: 'blocked', order: 0, criterion: identifier, reason: 'missing_tb' };
          }
          keyA.push(valueA);
          keyB.push(valueB);
          const cmp = sortNumber(valueA, valueB);
          if (cmp) return { status: 'decided', order: cmp, criterion: 'imported_tbs', aValue: keyA, bValue: keyB };
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
    if (isNonSummableTieBreakName(criterion.name)) {
      return { status: 'blocked', order: 0, criterion: identifier, reason: 'undefined_tb' };
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

/**
 * Default order for a new group (owner decisions, 1 Nov 2026): Total Points
 * (fixed, not listed) → Highest individual scores → Best individual rank →
 * Imported individual tie-breaks. Every listed step is removable and
 * re-orderable, and none depends on an Excel having been imported yet.
 */
export function defaultTeamRankingCriteria(): TeamRankingCriterion[] {
  return [{ kind: 'score_vector' }, { kind: 'best_rank' }, { kind: 'imported_tbs' }];
}
