import { describe, expect, it } from 'vitest';
import {
  compareTeamRankingV2,
  defaultTeamRankingCriteria,
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
