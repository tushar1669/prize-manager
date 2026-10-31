import { describe, expect, it } from 'vitest';
import {
  TEAM_TIEBREAK_METHODS,
  findTeamTieBreakMethod,
  isNonSummableTieBreakName,
  normalizeTieBreakName,
} from '@/utils/teamTieBreakMethods';
import {
  compareTeamRankingV2,
  rankTeamCandidatesV2,
  type TeamRankingCandidate,
  type TeamRankingCriterion,
  type TeamRankingRuleConfig,
} from '@/utils/teamRankingV2';

describe('standard team tie-break method list', () => {
  it('has unique ids, names and spellings, so one name can never mean two methods', () => {
    const ids = TEAM_TIEBREAK_METHODS.map(method => method.id);
    expect(new Set(ids).size).toBe(ids.length);
    const owner = new Map<string, string>();
    for (const method of TEAM_TIEBREAK_METHODS) {
      for (const key of [method.name, method.optionLabel, ...method.aliases].map(normalizeTieBreakName)) {
        expect(key, `empty spelling for ${method.id}`).not.toBe('');
        const previous = owner.get(key);
        expect(previous === undefined || previous === method.id, `"${key}" claimed by ${previous} and ${method.id}`).toBe(true);
        owner.set(key, method.id);
      }
    }
  });

  it('marks only Direct Encounter as not summable for a team', () => {
    expect(TEAM_TIEBREAK_METHODS.filter(method => !method.summable).map(method => method.id)).toEqual(['de']);
  });

  it('contains the owner-approved dropdown entries in order', () => {
    expect(TEAM_TIEBREAK_METHODS.map(method => method.name)).toEqual([
      'Buchholz Cut-1', 'Buchholz', 'Buchholz Cut-2', 'Median Buchholz', 'Sonneborn-Berger',
      'Progressive / Cumulative score', 'Number of wins', 'Games played with Black',
      'Average Rating of Opponents', 'Performance Rating', 'Koya score', 'Direct Encounter',
    ]);
  });

  it('recognises common spellings regardless of case, spaces and punctuation', () => {
    expect(findTeamTieBreakMethod('BH-C1')?.id).toBe('bh_c1');
    expect(findTeamTieBreakMethod('buchholz cut 1')?.id).toBe('bh_c1');
    expect(findTeamTieBreakMethod('Buchholz Cut-1 (BH-C1)')?.id).toBe('bh_c1');
    expect(findTeamTieBreakMethod('Buchholz')?.id).toBe('bh');
    expect(findTeamTieBreakMethod('S.B.')?.id).toBe('sb');
    expect(findTeamTieBreakMethod('Neustadtl')?.id).toBe('sb');
    expect(findTeamTieBreakMethod('direct-encounter')?.id).toBe('de');
  });

  it('treats unknown, blank and missing names as custom, never as a standard method', () => {
    expect(findTeamTieBreakMethod('Fide rating average of top 3')).toBeNull();
    expect(findTeamTieBreakMethod('   ')).toBeNull();
    expect(findTeamTieBreakMethod(undefined)).toBeNull();
    expect(isNonSummableTieBreakName('Sonneborn-Berger')).toBe(false);
    expect(isNonSummableTieBreakName('Custom brochure rule')).toBe(false);
    expect(isNonSummableTieBreakName('Direct Encounter')).toBe(true);
    expect(isNonSummableTieBreakName('DE')).toBe(true);
    expect(isNonSummableTieBreakName('Direct encounter between the tied teams')).toBe(true);
    expect(isNonSummableTieBreakName('Head-to-head result')).toBe(true);
    // A word that merely contains "de" is not Direct Encounter.
    expect(isNonSummableTieBreakName('Decimal Buchholz variant')).toBe(false);
  });
});

// Matched pairs: identical teams and values; only the declared method differs.
const team = (key: string, tb1: number[], sourceHash = 'file-1'): TeamRankingCandidate => ({
  key,
  selectedPlayers: tb1.map(value => ({ points: 6, sourceHash, individualTieBreaks: { 1: value } })),
});
const criterion = (name: string): TeamRankingCriterion =>
  ({ kind: 'source_tb', ordinal: 1, name, aggregation: 'sum', direction: 'higher', verified: true });
const config = (name: string): TeamRankingRuleConfig => ({
  version: 2,
  source_hash: 'file-1',
  published_reference: 'Synthetic brochure clause 4',
  organizer_confirmed: true,
  criteria: [{ kind: 'score_vector' }, criterion(name)],
});

describe('Direct Encounter can never decide a team prize by summing (server guard)', () => {
  const a = team('A', [3, 4]);
  const b = team('B', [2, 4]);

  it('pairwise: Sonneborn-Berger decides, Direct Encounter on the same data blocks', () => {
    expect(compareTeamRankingV2(a, b, [criterion('Sonneborn-Berger')])).toMatchObject({
      status: 'decided', criterion: 'TB1', order: -1, aValue: 7, bValue: 6,
    });
    expect(compareTeamRankingV2(a, b, [criterion('Direct Encounter')])).toMatchObject({
      status: 'blocked', criterion: 'TB1', reason: 'undefined_tb',
    });
    // Typed by hand instead of picked from the list: still blocked.
    expect(compareTeamRankingV2(a, b, [criterion('direct encounter (DE)')])).toMatchObject({
      status: 'blocked', reason: 'undefined_tb',
    });
  });

  it('partition ranking: Sonneborn-Berger separates the teams, Direct Encounter holds them for a ruling', () => {
    const resolved = rankTeamCandidatesV2([b, a], config('Sonneborn-Berger'));
    expect(resolved.map(part => part.teams.map(t => t.key))).toEqual([['A'], ['B']]);
    expect(resolved.every(part => part.status === 'resolved')).toBe(true);

    const held = rankTeamCandidatesV2([b, a], config('Direct Encounter'));
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ status: 'blocked', criterion: 'TB1', reason: 'undefined_tb' });
    expect(held[0].teams.map(t => t.key).sort()).toEqual(['A', 'B']);
  });
});
