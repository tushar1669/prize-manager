import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  compareTeamRankingV2,
  defaultTeamRankingCriteria,
  importedTieBreakContextFromTags,
  parseTeamRankingRuleConfig,
  rankTeamCandidatesV2,
  type ImportedTieBreakContext,
  type TeamRankingCandidate,
  type TeamRankingCriterion,
  type TeamRankingRuleConfig,
} from '@/utils/teamRankingV2';
import { buildTeamRankingAwardAudit } from '../../supabase/functions/_shared/teamRankingAudit';
import { teamAppliedCriterionLabel } from '@/utils/teamAppliedCriterion';

// Synthetic values only. Owner's rule (1 Nov 2026): TB1 of the 1st player,
// then TB1 of the next player, …; if TB1 is equal for all, TB2 of the 1st
// player, and so on. Higher wins.
const HASH = 'synthetic-file-hash';
const context = (headers: string[]): ImportedTieBreakContext => ({
  status: 'available',
  sourceHash: HASH,
  columns: headers.map((header, i) => ({ ordinal: i + 1, header })),
});
const imported: TeamRankingCriterion = { kind: 'imported_tbs' };
const bestRank: TeamRankingCriterion = { kind: 'best_rank' };
const approved = (criteria: TeamRankingCriterion[]): TeamRankingRuleConfig => ({
  version: 2, source_hash: null, published_reference: 'Synthetic brochure clause 7',
  organizer_confirmed: true, criteria,
});
/** Each player: [rank, points, TB1, TB2, …]. */
type Row = [number, number, ...(number | null)[]];
const team = (key: string, players: Row[], hash: string | null = HASH): TeamRankingCandidate => ({
  key,
  selectedPlayers: players.map(([rank, points, ...tbs]) => ({
    rank, points, sourceHash: hash,
    individualTieBreaks: Object.fromEntries(tbs.map((value, i) => [i + 1, value])),
  })),
});
const order = (parts: ReturnType<typeof rankTeamCandidatesV2>) =>
  parts.map(part => `${part.teams.map(t => t.key).join('+')}:${part.status}:${part.criterion ?? ''}${part.reason ? `:${part.reason}` : ''}`);

describe('Imported individual tie-breaks — one step, chosen before any Excel is imported', () => {
  const headers = ['BH:GP/C1', 'BH:GP'];

  it('compares TB1 player by player before it ever looks at TB2', () => {
    // TB1: 1st players equal; 2nd players 15 vs 16 → B. (TB2 of the 1st
    // player would favour A, but TB2 is only used when TB1 is equal for all.)
    const a = team('A', [[1, 5, 20, 40], [4, 4, 15, 1]]);
    const b = team('B', [[2, 5, 20, 10], [3, 4, 16, 1]]);
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]), context(headers))))
      .toEqual(['B:resolved:imported_tbs', 'A:resolved:imported_tbs']);
    expect(compareTeamRankingV2(a, b, [imported], context(headers)))
      .toMatchObject({ status: 'decided', order: 1, criterion: 'imported_tbs' });
  });

  it('moves to TB2 only when TB1 is equal for every player, starting again from the 1st player', () => {
    const a = team('A', [[1, 5, 20, 12], [4, 4, 15, 1]]);
    const b = team('B', [[2, 5, 20, 11], [3, 4, 15, 50]]);
    expect(order(rankTeamCandidatesV2([b, a], approved([imported]), context(headers))))
      .toEqual(['A:resolved:imported_tbs', 'B:resolved:imported_tbs']);
    expect(compareTeamRankingV2(a, b, [imported], context(headers)))
      .toMatchObject({ status: 'decided', order: -1, criterion: 'imported_tbs' });
  });

  it('the 1st player is the best-ranked counted player, whatever order the roster arrives in', () => {
    const a = team('A', [[6, 4, 10], [1, 5, 30]]); // board order: rank 1 (30), rank 6 (10)
    const b = team('B', [[2, 5, 25], [5, 4, 50]]); // board order: rank 2 (25), rank 5 (50)
    expect(order(rankTeamCandidatesV2([b, a], approved([imported]), context(['SB']))))
      .toEqual(['A:resolved:imported_tbs', 'B:resolved:imported_tbs']);
  });

  it('skips a Direct Encounter column: it cannot be compared between different players', () => {
    const a = team('A', [[1, 5, 20, 1, 10], [4, 4, 15, 1, 10]]);
    const b = team('B', [[2, 5, 20, 0, 20], [3, 4, 15, 0, 20]]);
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]), context(['BH:GP/C1', 'DE', 'SB']))))
      .toEqual(['B:resolved:imported_tbs', 'A:resolved:imported_tbs']);
    expect(compareTeamRankingV2(a, b, [imported], context(['BH:GP/C1', 'DE', 'SB'])))
      .toMatchObject({ status: 'decided', order: 1, criterion: 'imported_tbs' });
    // Only a DE column: nothing comparable, so a tie that reaches it is held.
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]), context(['DE']))))
      .toEqual(['A+B:blocked:imported_tbs:no_imported_tbs']);
  });

  it('a blank value holds only the teams that actually need it', () => {
    const a = team('A', [[1, 5, 30], [6, 4, null]]); // decided at the 1st player
    const b = team('B', [[2, 5, 20], [5, 4, 5]]);
    const c = team('C', [[3, 5, 20], [4, 4, 6]]);
    expect(order(rankTeamCandidatesV2([b, c, a], approved([imported]), context(['SB']))))
      .toEqual(['A:resolved:imported_tbs', 'C:resolved:imported_tbs', 'B:resolved:imported_tbs']);

    const needed = team('A', [[1, 5, 20], [6, 4, null]]);
    expect(order(rankTeamCandidatesV2([needed, b], approved([imported]), context(['SB']))))
      .toEqual(['A+B:blocked:imported_tbs:missing_tb']);
    expect(compareTeamRankingV2(needed, b, [imported], context(['SB'])))
      .toMatchObject({ status: 'blocked', criterion: 'imported_tbs', reason: 'missing_tb' });
  });

  it('values saved from a different Excel file never count', () => {
    const a = team('A', [[1, 5, 20], [6, 4, 7]]);
    const stale = team('B', [[2, 5, 25], [5, 4, 9]], 'older-file-hash');
    expect(order(rankTeamCandidatesV2([a, stale], approved([imported]), context(['SB']))))
      .toEqual(['A+B:blocked:imported_tbs:missing_tb']);
  });

  it('no Excel imported yet, or players from two different imports: held with a clear reason', () => {
    const a = team('A', [[1, 5, 20], [6, 4, 7]]);
    const b = team('B', [[2, 5, 25], [5, 4, 9]]);
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]))))
      .toEqual(['A+B:blocked:imported_tbs:no_imported_tbs']);
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]),
      { status: 'unavailable', reason: 'mixed_tb_sources' })))
      .toEqual(['A+B:blocked:imported_tbs:mixed_tb_sources']);
    expect(compareTeamRankingV2(a, b, [imported]))
      .toMatchObject({ status: 'blocked', criterion: 'imported_tbs', reason: 'no_imported_tbs' });
  });

  it('a counted player without a rank has no board position: held', () => {
    const a = team('A', [[1, 5, 20], [6, 4, 7]]);
    const b: TeamRankingCandidate = { key: 'B', selectedPlayers: [
      { rank: null, points: 5, sourceHash: HASH, individualTieBreaks: { 1: 25 } },
      { rank: 5, points: 4, sourceHash: HASH, individualTieBreaks: { 1: 9 } },
    ] };
    expect(order(rankTeamCandidatesV2([a, b], approved([imported]), context(['SB']))))
      .toEqual(['A+B:blocked:imported_tbs:missing_rank']);
  });

  it('is never reached when Total Points already separates the teams', () => {
    const a = team('A', [[1, 6, null], [6, 4, null]]);
    const b = team('B', [[2, 5, null], [5, 4, null]]);
    expect(order(rankTeamCandidatesV2([b, a], approved([imported]))))
      .toEqual(['A:resolved:total_points', 'B:resolved:total_points']);
  });

  it('when every imported TB is equal, the next step decides; with no next step it stays tied', () => {
    const a = team('A', [[1, 5, 20], [6, 4, 7]]);
    const b = team('B', [[2, 5, 20], [5, 4, 7]]);
    expect(order(rankTeamCandidatesV2([b, a], approved([imported, bestRank]), context(['SB']))))
      .toEqual(['A:resolved:best_rank', 'B:resolved:best_rank']);
    expect(order(rankTeamCandidatesV2([b, a], approved([imported]), context(['SB']))))
      .toEqual(['B+A:tied:']);
    // Best individual rank placed ABOVE it always decides first.
    const tbFavoursB = team('B', [[2, 5, 99], [5, 4, 99]]);
    expect(order(rankTeamCandidatesV2([tbFavoursB, a], approved([bestRank, imported]), context(['SB']))))
      .toEqual(['A:resolved:best_rank', 'B:resolved:best_rank']);
  });
});

describe('Imported individual tie-breaks — rules, defaults and source columns', () => {
  it('is stored as exactly { kind: "imported_tbs" } and parses back unchanged', () => {
    const raw = approved([{ kind: 'score_vector' }, { kind: 'imported_tbs' }, { kind: 'best_rank' }]);
    const parsed = parseTeamRankingRuleConfig(raw);
    expect(parsed).toEqual(raw);
    expect(parseTeamRankingRuleConfig(approved([imported, imported]))).toBeNull();
  });

  it('a new group starts: Highest individual scores → Best individual rank → Imported individual tie-breaks', () => {
    expect(defaultTeamRankingCriteria())
      .toEqual([{ kind: 'score_vector' }, { kind: 'best_rank' }, { kind: 'imported_tbs' }]);
  });

  const tag = (hash: string, headers: string[], values: Array<number | null>) => ({
    team_tiebreak_v2: {
      version: 1, source_hash: hash,
      source_columns: headers.map((header, i) => ({ ordinal: i + 1, header, column: 10 + i })),
      values: Object.fromEntries(values.map((value, i) => [String(i + 1), value])),
    },
  });

  it('reads the columns from the players of the current import', () => {
    expect(importedTieBreakContextFromTags([
      tag(HASH, ['BH:GP/C1', 'BH:GP', 'SB'], [1, 2, 3]),
      null, // a player added by hand has no imported tie-breaks
      { unrelated: true },
      tag(HASH, ['BH:GP/C1', 'BH:GP', 'SB'], [4, null, 6]),
    ])).toEqual({ status: 'available', sourceHash: HASH, columns: [
      { ordinal: 1, header: 'BH:GP/C1' }, { ordinal: 2, header: 'BH:GP' }, { ordinal: 3, header: 'SB' },
    ] });
  });

  it('no imported tie-breaks, or players from different imports, are not usable', () => {
    expect(importedTieBreakContextFromTags([null, { team: 'x' }]))
      .toEqual({ status: 'unavailable', reason: 'no_imported_tbs' });
    expect(importedTieBreakContextFromTags([tag(HASH, ['SB'], [1]), tag('other-file', ['SB'], [2])]))
      .toEqual({ status: 'unavailable', reason: 'mixed_tb_sources' });
    expect(importedTieBreakContextFromTags([tag(HASH, ['SB'], [1]), tag(HASH, ['BH'], [2])]))
      .toEqual({ status: 'unavailable', reason: 'mixed_tb_sources' });
    const unhashed = { team_tiebreak_v2: { ...tag(HASH, ['SB'], [1]).team_tiebreak_v2, source_hash: null } };
    expect(importedTieBreakContextFromTags([unhashed]))
      .toEqual({ status: 'unavailable', reason: 'no_imported_tbs' });
    const malformed = { team_tiebreak_v2: { version: 1, source_hash: HASH, source_columns: 'SB', values: {} } };
    expect(importedTieBreakContextFromTags([tag(HASH, ['SB'], [1]), malformed]))
      .toEqual({ status: 'unavailable', reason: 'mixed_tb_sources' });
  });
});

describe('Imported individual tie-breaks — audit trail and labels', () => {
  const groupRule = { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' };
  const prize = { id: 'prize-1', place: 1, cash_amount: 1000, has_trophy: true, has_medal: false };
  const a = team('A', [[1, 5, 20, 1, 12], [4, 4, 15, 1, 1]]);
  const b = team('B', [[2, 5, 20, 0, 11], [3, 4, 15, 0, 50]]);
  const withIds = (t: TeamRankingCandidate) => ({
    key: t.key, selectedPlayers: t.selectedPlayers.map((p, i) => ({ ...p, playerId: `${t.key}-${i}` })),
  });
  const ctx = context(['BH:GP/C1', 'DE', 'SB']);

  it('records which Excel columns were compared, and that DE was skipped', () => {
    const rules = approved([imported]);
    const partitions = rankTeamCandidatesV2([a, b], rules, ctx);
    const snapshot = buildTeamRankingAwardAudit('g', groupRule, prize, 'A', rules,
      [withIds(a), withIds(b)], partitions, undefined, ctx);
    expect(snapshot).toMatchObject({
      decided_by_criterion: 'imported_tbs',
      imported_tie_breaks: { status: 'available', source_hash: HASH, columns: [
        { ordinal: 1, header: 'BH:GP/C1', compared: true },
        { ordinal: 2, header: 'DE', compared: false },
        { ordinal: 3, header: 'SB', compared: true },
      ] },
    });
    expect(teamAppliedCriterionLabel(snapshot)).toBe('Imported individual tie-breaks');
  });

  it('adds nothing to the audit of rules that do not use the step', () => {
    const rules = approved([bestRank]);
    const partitions = rankTeamCandidatesV2([a, b], rules, ctx);
    const snapshot = buildTeamRankingAwardAudit('g', groupRule, prize, 'A', rules,
      [withIds(a), withIds(b)], partitions, undefined, ctx);
    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toHaveProperty('imported_tie_breaks');
  });

  it('the allocator reads the import once and passes it to ranking and audit', () => {
    const source = readFileSync('supabase/functions/allocateInstitutionPrizes/index.ts', 'utf8');
    expect(source).toContain('importedTieBreakContextFromTags(typedPlayers.map(');
    expect(source).toContain('rankTeamCandidatesV2(selectedCandidates, config, importedTieBreaks)');
    expect(source).toMatch(/winner\.key, config, selectedCandidates, partitions,\s*undefined, importedTieBreaks,/);
    expect(source).toContain('adjudication_imported_tie_breaks: importedTieBreaks');
  });
});
