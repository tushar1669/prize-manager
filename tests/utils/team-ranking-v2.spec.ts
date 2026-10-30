import { describe, expect, it } from 'vitest';
import {
  compareTeamRankingV2,
  defaultTeamRankingCriteria,
  rankTeamCandidatesV2,
  parseTeamRankingRuleConfig,
  type TeamRankingCandidate,
  type TeamRankingCriterion,
} from '@/utils/teamRankingV2';

const team = (key: string, points: Array<number | null>, values: Record<number, Array<number | null>> = {}): TeamRankingCandidate => ({
  key,
  selectedPlayers: points.map((score, i) => ({
    points: score,
    individualTieBreaks: Object.fromEntries(
      Object.entries(values).map(([ordinal, items]) => [Number(ordinal), items[i]]),
    ),
  })),
});
const vector: TeamRankingCriterion = { kind: 'score_vector' };
const tb = (ordinal: number, direction: 'higher' | 'lower' = 'higher'): TeamRankingCriterion =>
  ({ kind: 'source_tb', ordinal, name: `Verified metric ${ordinal}`, aggregation: 'sum', direction, verified: true });

describe('Team Ranking v2 — pure, fail-closed comparison', () => {
  it('keeps total points first, regardless of subsequent criterion order', () => {
    const a = team('A', [7, 6]);
    const b = team('B', [10, 1]);
    expect(compareTeamRankingV2(a, b, [vector])).toMatchObject({
      status: 'decided', criterion: 'total_points', order: -1, aValue: 13, bValue: 11,
    });
  });

  it('compares highest scorer, then next scorer: 7+5 beats 6+6', () => {
    const a = team('A', [5, 7]);
    const b = team('B', [6, 6]);
    expect(compareTeamRankingV2(a, b, [vector])).toMatchObject({
      status: 'decided', criterion: 'score_vector', order: -1,
      aValue: [7, 5], bValue: [6, 6],
    });
    expect(compareTeamRankingV2(b, a, [vector])).toMatchObject({ order: 1 });
  });

  it('uses all verified TBs in organizer order only when earlier stages cannot resolve', () => {
    const a = team('A', [6, 6], { 1: [3, 4], 2: [4, 5], 3: [5, 6] });
    const b = team('B', [6, 6], { 1: [3, 4], 2: [4, 7], 3: [5, 6] });
    expect(compareTeamRankingV2(a, b, [vector, tb(1), tb(2), tb(3)])).toMatchObject({
      status: 'decided', criterion: 'TB2', order: 1, aValue: 9, bValue: 11,
    });
    expect(compareTeamRankingV2(a, b, [tb(2), vector, tb(1)])).toMatchObject({
      status: 'decided', criterion: 'TB2', order: 1,
    });
  });

  it('honors explicit lower-is-better TB semantics', () => {
    const a = team('A', [6, 6], { 1: [5, 6] });
    const b = team('B', [6, 6], { 1: [4, 4] });
    expect(compareTeamRankingV2(a, b, [tb(1, 'lower')])).toMatchObject({
      status: 'decided', criterion: 'TB1', order: 1,
    });
  });

  it('never equates missing points or missing required TB with zero', () => {
    expect(compareTeamRankingV2(team('A', [null, 12]), team('B', [6, 6]), [vector]))
      .toMatchObject({ status: 'blocked', reason: 'missing_points' });
    const a = team('A', [6, 6], { 1: [0, null] });
    const b = team('B', [6, 6], { 1: [0, 0] });
    expect(compareTeamRankingV2(a, b, [vector, tb(1)]))
      .toMatchObject({ status: 'blocked', criterion: 'TB1', reason: 'missing_tb' });
    const validZero = team('A', [6, 6], { 1: [0, 0] });
    expect(compareTeamRankingV2(validZero, b, [vector, tb(1)])).toMatchObject({ status: 'tied' });
  });

  it('does not require an unused later TB if an earlier rule decides', () => {
    const a = team('A', [7, 5]);
    const b = team('B', [6, 6]);
    expect(compareTeamRankingV2(a, b, [vector, tb(1)])).toMatchObject({ status: 'decided', criterion: 'score_vector' });
  });

  it('refuses unknown event TB meaning; never silently skips it to choose another winner', () => {
    const a = team('A', [6, 6], { 2: [10, 12] });
    const b = team('B', [6, 6], { 2: [8, 8] });
    const unverified = defaultTeamRankingCriteria([1, 2])[1];
    expect(compareTeamRankingV2(a, b, [unverified, tb(2)])).toMatchObject({
      status: 'blocked', reason: 'undefined_tb', criterion: 'TB1',
    });
  });

  it('does not invent a winner when all criteria are exhausted', () => {
    const a = team('A', [6, 6], { 1: [3, 4] });
    const b = team('B', [6, 6], { 1: [4, 3] });
    expect(compareTeamRankingV2(a, b, [vector, tb(1)])).toEqual({ status: 'tied', order: 0 });
  });

  it('rejects duplicate criteria and invalid team rosters', () => {
    expect(compareTeamRankingV2(team('A', [6, 6]), team('B', [6, 6]), [vector, vector]))
      .toMatchObject({ status: 'blocked', reason: 'duplicate_criterion' });
    expect(compareTeamRankingV2(team('A', [6]), team('B', [6, 0]), [vector]))
      .toMatchObject({ status: 'blocked', reason: 'invalid_team_size' });
    expect(compareTeamRankingV2(team('A', []), team('B', []), [vector]))
      .toMatchObject({ status: 'blocked', reason: 'invalid_team_size' });
  });

  it('creates defaults in actual source ordinal order, not TB text sorting', () => {
    const list = defaultTeamRankingCriteria([10, 2, 1, 10, 0, -3]);
    expect(list.map(x => x.kind === 'score_vector' ? 'vector' : `TB${x.ordinal}`))
      .toEqual(['vector', 'TB1', 'TB2', 'TB10']);
    expect(list.slice(1).every(x => x.kind === 'source_tb' && !x.verified && x.name === '')).toBe(true);
  });
});

describe('safe ordered team prize partitions — no invented awards', () => {
  const approved = (criteria: TeamRankingCriterion[] = [vector]) => ({
    version: 2 as const, source_hash: 'fixture-import', published_reference: 'fixture regulations section 2',
    organizer_confirmed: true, criteria,
  });

  it('orders three points-equal institutions by descending individual score vectors', () => {
    const result = rankTeamCandidatesV2([
      team('C', [6, 6]), team('A', [8, 4]), team('B', [7, 5]),
    ], approved());
    expect(result.map(p => p.teams.map(t => t.key))).toEqual([['A'], ['B'], ['C']]);
    expect(result.every(p => p.status === 'resolved')).toBe(true);
  });

  it('does not pay teams under obsolete rules even when total points differ', () => {
    // A legacy group with no v2 rules must NEVER silently award first prize:
    // unique total scores do not authorize replacing the event regulations.
    const candidates = [team('Club A', [8, 7]), team('Club B', [6, 5])];
    for (const unapproved of [null, {
      ...approved(), organizer_confirmed: false,
    }, {
      ...approved(), published_reference: '',
    }]) {
      const partitions = rankTeamCandidatesV2(candidates, unapproved);
      expect(partitions.every(partition => partition.status === 'blocked')).toBe(true);
      expect(partitions.flatMap(partition => partition.teams).map(t => t.key).sort())
        .toEqual(['Club A', 'Club B']);
    }
  });

  it('withholds results when organizer has not confirmed the published team rules', () => {
    const result = rankTeamCandidatesV2([team('A', [7, 5]), team('B', [6, 6])], null);
    expect(result).toMatchObject([{ status: 'blocked', reason: 'unapproved_rules' }]);
    expect(result[0].teams).toHaveLength(2);
  });

  it('only blocks the unresolved subset when an imported TB is missing', () => {
    const top = team('Top', [8, 7]); // 15 > 12
    const one = team('One', [6, 6], { 1: [null, 3] });
    const two = team('Two', [6, 6], { 1: [2, 5] });
    // Import provenance must match for valid TB comparison.
    for (const t of [one, two]) t.selectedPlayers.forEach(player => { player.sourceHash = 'fixture-import'; });
    const result = rankTeamCandidatesV2([one, top, two], approved([tb(1)]));
    expect(result[0]).toMatchObject({ status: 'resolved', criterion: 'total_points' });
    expect(result[0].teams.map(t => t.key)).toEqual(['Top']);
    expect(result[1]).toMatchObject({ status: 'blocked', criterion: 'TB1', reason: 'missing_tb' });
    expect(result[1].teams).toHaveLength(2);
  });

  it('uses only matching import provenance for TB monetary ranking', () => {
    const one = team('One', [6, 6], { 1: [5, 6] });
    const two = team('Two', [6, 6], { 1: [4, 4] });
    one.selectedPlayers.forEach(player => { player.sourceHash = 'fixture-import'; });
    two.selectedPlayers.forEach(player => { player.sourceHash = 'old-file'; });
    expect(rankTeamCandidatesV2([one, two], approved([tb(1)]))).toMatchObject([
      { status: 'blocked', reason: 'missing_tb', criterion: 'TB1' },
    ]);
    two.selectedPlayers.forEach(player => { player.sourceHash = 'fixture-import'; });
    expect(rankTeamCandidatesV2([one, two], approved([tb(1)]))).toMatchObject([
      { status: 'resolved', criterion: 'TB1' },
      { status: 'resolved', criterion: 'TB1' },
    ]);
  });

  it('preserves equal full ties without awarding distinct cash places', () => {
    expect(rankTeamCandidatesV2([team('A', [6, 6]), team('B', [6, 6])], approved()))
      .toMatchObject([{ status: 'tied', teams: [{ key: 'A' }, { key: 'B' }] }]);
  });

  it('rejects untrusted or duplicate JSON rule configurations', () => {
    expect(parseTeamRankingRuleConfig(null)).toBeNull();
    expect(parseTeamRankingRuleConfig({
      ...approved(), criteria: [vector, vector],
    })).toBeNull();
    expect(parseTeamRankingRuleConfig(approved([vector, tb(1)]))).toMatchObject({
      version: 2, organizer_confirmed: true, criteria: [{ kind: 'score_vector' }, { kind: 'source_tb', ordinal: 1 }],
    });
  });
});
