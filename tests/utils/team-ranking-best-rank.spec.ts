import { describe, expect, it } from 'vitest';
import {
  compareTeamRankingV2,
  defaultTeamRankingCriteria,
  parseTeamRankingRuleConfig,
  rankTeamCandidatesV2,
  type TeamRankingCandidate,
  type TeamRankingCriterion,
  type TeamRankingRuleConfig,
} from '@/utils/teamRankingV2';
import { teamAppliedCriterionLabel } from '../../supabase/functions/_shared/teamAppliedCriterion';
import { isTeamV2Group } from '@/utils/teamTieDetection';

// Synthetic teams: [points, rank] per counted player.
const team = (key: string, players: Array<[number, number | null]>): TeamRankingCandidate => ({
  key,
  selectedPlayers: players.map(([points, rank]) => ({ points, rank, sourceHash: 'h', individualTieBreaks: {} })),
});
const bestRank: TeamRankingCriterion = { kind: 'best_rank' };
const vector: TeamRankingCriterion = { kind: 'score_vector' };
const approved = (criteria: TeamRankingCriterion[]): TeamRankingRuleConfig => ({
  version: 2, source_hash: 'h', published_reference: 'Synthetic brochure clause 4', organizer_confirmed: true, criteria,
});

describe('Team V2 — Best individual rank (arbiter rule: Total Points → best-placed player)', () => {
  // Equal totals. A's best player is rank 1; B's best is rank 3.
  // The old Rank Sum would pick B (8 < 21). Team V2 never uses Rank Sum.
  const a = team('A', [[6, 1], [6, 20]]);
  const b = team('B', [[6, 3], [6, 5]]);

  it('the team whose best counted player is placed higher wins', () => {
    expect(compareTeamRankingV2(a, b, [bestRank])).toMatchObject({
      status: 'decided', criterion: 'best_rank', order: -1, aValue: 1, bValue: 3,
    });
    expect(compareTeamRankingV2(b, a, [bestRank])).toMatchObject({ status: 'decided', order: 1 });
  });

  it('partitions three equal-total teams completely, best rank first', () => {
    const c = team('C', [[6, 2], [6, 9]]);
    const parts = rankTeamCandidatesV2([b, c, a], approved([bestRank]));
    expect(parts.map(p => p.teams.map(t => t.key))).toEqual([['A'], ['C'], ['B']]);
    expect(parts.every(p => p.status === 'resolved' && p.criterion === 'best_rank')).toBe(true);
  });

  it('Total Points still decides first; best rank only breaks equal totals', () => {
    const richer = team('R', [[7, 40], [6, 41]]);
    expect(compareTeamRankingV2(richer, a, [bestRank])).toMatchObject({ criterion: 'total_points', order: -1 });
  });

  it('the default order applies Highest individual scores before Best individual rank', () => {
    const x = team('X', [[7, 30], [5, 31]]); // 7+5, best rank 30
    const y = team('Y', [[6, 1], [6, 2]]);   // 6+6, best rank 1
    expect(compareTeamRankingV2(x, y, defaultTeamRankingCriteria([]))).toMatchObject({ criterion: 'score_vector', order: -1 });
    // With the arbiter's order (best rank only), Y wins instead.
    expect(compareTeamRankingV2(x, y, [bestRank])).toMatchObject({ criterion: 'best_rank', order: 1 });
  });

  it('a missing rank blocks instead of guessing (matched pair)', () => {
    const withRank = team('M', [[6, 4], [6, 8]]);
    const noRank = team('M', [[6, null], [6, 8]]);
    expect(compareTeamRankingV2(withRank, b, [bestRank])).toMatchObject({ status: 'decided' });
    expect(compareTeamRankingV2(noRank, b, [bestRank])).toMatchObject({ status: 'blocked', reason: 'missing_rank' });
    expect(rankTeamCandidatesV2([noRank, b], approved([bestRank]))[0]).toMatchObject({ status: 'blocked', reason: 'missing_rank' });
  });

  it('steps after Best individual rank are never reached, even an unconfirmed tie-break', () => {
    const unconfirmedTb: TeamRankingCriterion = { kind: 'source_tb', ordinal: 1, name: '', aggregation: 'sum', direction: 'higher', verified: false };
    const parts = rankTeamCandidatesV2([a, b], approved([bestRank, unconfirmedTb]));
    expect(parts.every(p => p.status === 'resolved')).toBe(true);
  });
});

describe('Team V2 rules — every step after Total Points is optional', () => {
  it('accepts Best individual rank, lists without Highest individual scores, and an empty list', () => {
    expect(parseTeamRankingRuleConfig(approved([bestRank]))?.criteria).toEqual([{ kind: 'best_rank' }]);
    expect(parseTeamRankingRuleConfig(approved([]))?.criteria).toEqual([]);
    expect(parseTeamRankingRuleConfig(approved([bestRank, vector]))?.criteria.map(c => c.kind)).toEqual(['best_rank', 'score_vector']);
  });

  it('rejects a duplicated step and unknown kinds such as rank_sum', () => {
    expect(parseTeamRankingRuleConfig(approved([bestRank, bestRank]))).toBeNull();
    expect(parseTeamRankingRuleConfig({ ...approved([]), criteria: [{ kind: 'rank_sum' }] })).toBeNull();
  });

  it('with no steps listed, equal totals stay tied for an official ruling', () => {
    const a = team('A', [[6, 1], [6, 20]]);
    const b = team('B', [[6, 3], [6, 5]]);
    expect(rankTeamCandidatesV2([a, b], approved([]))).toMatchObject([{ status: 'tied' }]);
  });
});

describe('Labels and screens', () => {
  it('a saved award decided by Best individual rank says so', () => {
    expect(teamAppliedCriterionLabel({ schema_version: 2, decided_by_criterion: 'best_rank' })).toBe('Best individual rank');
  });

  it('recognises V2 groups so no Rank Sum wording is shown for them', () => {
    const base = { prizes: [] } as never;
    expect(isTeamV2Group({ ...(base as object), ranking_issues: [] } as never)).toBe(true);
    expect(isTeamV2Group({ prizes: [{ winner_institution: { ranking_snapshot: { schema_version: 2 } } }] } as never)).toBe(true);
    expect(isTeamV2Group({ prizes: [{ winner_institution: { ranking_snapshot: null } }] } as never)).toBe(false);
  });
});
