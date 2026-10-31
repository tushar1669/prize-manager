import { describe, expect, it } from 'vitest';
import { prepareAdjudicatedTeamV2Rows } from '../../supabase/functions/_shared/teamV2AdjudicatedSaveRows';

const rules = {
  version: 2 as const, source_hash: null, published_reference: 'regulation-7',
  organizer_confirmed: true, criteria: [{ kind: 'score_vector' as const }],
};
const group = {
  id: 'group', group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
  scoring_mode: 'by_top_k_score', ranking_rules: rules,
};
const dbPrizes = [
  { id: 'gold', group_id: 'group', place: 1, cash_amount: 200,
    has_trophy: true, has_medal: false },
  { id: 'silver', group_id: 'group', place: 2, cash_amount: 100,
    has_trophy: true, has_medal: false },
];
const members = (prefix: string) => [
  { player_id: prefix+'1', name: 'Fixture 1', rank: 1, points: 5, gender: null },
  { player_id: prefix+'2', name: 'Fixture 2', rank: 2, points: 4, gender: null },
];
const team = (key: string, prefix: string) => ({
  key,
  members: members(prefix),
  selectedPlayers: [
    { playerId: prefix+'1', points: 5, sourceHash: null, individualTieBreaks: {} },
    { playerId: prefix+'2', points: 4, sourceHash: null, individualTieBreaks: {} },
  ],
});
const scorer = {
  groups: [{
    group_id: 'group',
    config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
      scoring_mode: 'by_top_k_score' },
    prizes: dbPrizes.map(p => ({ ...p, is_active: true, winner_institution: null })),
    ranking_issues: ['Place 1: team ranking tied', 'Place 2: team ranking tied'],
    adjudication_rules_reference: 'regulation-7',
    adjudication_partitions: [{ status: 'tied', teams: [team('A','a'), team('B','b')] }],
  }],
};
const individual = {
  winners: [{ prizeId: 'individual', playerId: 'a1', reasons: [], isManual: false }],
  unfilled: [],
  meta: { dryRun: false, hiddenWinnersCount: 0, activePrizeCount: 1,
    winnersCount: 1, unfilledCount: 0 },
};
const official = {
  group_id: 'group',
  proposal: {
    group_id: 'group', next_allocation_version: 2,
    tied_team_keys: ['A','B'], ordered_team_keys: ['B','A'],
    affected_places: [1,2], method: 'documented_arbiter_ruling',
    regulation_reference: 'regulation-7',
    arbiter_decision_reference: 'decision-1',
    explanation: 'Authorized by the published regulations',
  },
};
const actor = {
  currentAllocationVersion: 1, actorId: 'test-master',
  actorIsOwnerOrMaster: true, recordedAt: '2026-10-30T00:00:00Z',
};
const build = (preview: unknown = scorer, submissions: unknown[] = [official]) =>
  prepareAdjudicatedTeamV2Rows(['individual'], individual,
    [group], dbPrizes, preview, submissions, actor);

describe('official Team V2 Save rows from complete server-scored evidence', () => {
  it('builds all two official cash winners, preserving tied audit provenance', () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.team_rows.map(a => [a.prize_id,a.institution_key]))
      .toEqual([['gold','B'],['silver','A']]);
    expect(result.rows.rulings).toHaveLength(1);
    expect(result.rows.team_rows[0].ranking_snapshot).toMatchObject({
      allocation_version: 2, winner_key: 'B',
      decided_by_criterion: 'documented_arbiter_ruling',
      partitions: [{ status: 'tied', team_keys: ['A','B'] }],
      ruling: { arbiter_decision_reference: 'decision-1' },
    });
    expect(result.rows.team_rows[0].player_ids).toEqual(['b1','b2']);
    expect(result.rows.individual_rows).toHaveLength(1);
  });
  it('rejects absent/forged official decisions and stale versions', () => {
    expect(build(scorer, []).ok).toBe(false);
    expect(build(scorer, [official, official]).ok).toBe(false);
    expect(build(scorer, [{ ...official,
      proposal: { ...official.proposal, next_allocation_version: 4 } }]).ok).toBe(false);
    expect(build(scorer, [{ ...official,
      proposal: { ...official.proposal, ordered_team_keys: ['A','Invented'] } }]).ok).toBe(false);
  });
  it('rejects missing group, fabricated members, tampered money and blocked TBs', () => {
    expect(build({ groups: [] }).ok).toBe(false);
    expect(build({ groups: [{ ...scorer.groups[0], prizes: [
      { ...scorer.groups[0].prizes[0], cash_amount: 5000 },
      scorer.groups[0].prizes[1],
    ] }] }).ok).toBe(false);
    expect(build({ groups: [{ ...scorer.groups[0],
      adjudication_partitions: [{ status: 'blocked', reason: 'missing_tb',
        teams: scorer.groups[0].adjudication_partitions[0].teams }],
    }] }).ok).toBe(false);
    expect(build({ groups: [{ ...scorer.groups[0],
      adjudication_partitions: [{ status: 'tied', teams: [
        { ...team('A','a'), members: [{ ...members('a')[0], points: 800 }, members('a')[1] ] },
        team('B','b'),
      ] }],
    }] }).ok).toBe(false);
  });
});
