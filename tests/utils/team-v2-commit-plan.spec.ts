import { describe, expect, it } from 'vitest';
import { planTeamV2AwardPlaces } from '../../supabase/functions/_shared/teamV2CommitPlan';
import type { TeamRulingRecord } from '../../supabase/functions/_shared/teamTieAdjudicationV2';
import type { TeamRankingPartition } from '../../supabase/functions/_shared/teamRankingV2';

const team = (key: string) => ({ key, selectedPlayers: [{ points: 6 }] });
const partitions: TeamRankingPartition[] = [
  { status: 'resolved', criterion: 'total_points', teams: [team('Top')] },
  { status: 'tied', teams: [team('School A'), team('School B')] },
  { status: 'resolved', criterion: 'total_points', teams: [team('Fourth')] },
];
const prizes = [{ id: 'gold', place: 1 }, { id: 'silver', place: 2 }, { id: 'bronze', place: 3 }];
const ruling: TeamRulingRecord = {
  schema_version: 2, group_id: 'group', allocation_version: 8,
  supersedes_allocation_version: 7, actor_id: 'owner', recorded_at: '2026-10-27T03:00:00Z',
  method: 'documented_arbiter_ruling', regulation_reference: 'regulations section 4',
  arbiter_decision_reference: 'official ruling 17', explanation: 'Official ruling under published rules',
  tied_team_keys: ['School A', 'School B'],
  ordered_team_keys: ['School B', 'School A'], affected_places: [2, 3],
  award_instructions: [
    { place: 2, institution_key: 'School B' },
    { place: 3, institution_key: 'School A' },
  ],
};

describe('server-owned Team Ranking v2 new-version award planning', () => {
  it('preserves clear automatic winners and uses only the authorized tie order for prize places', () => {
    expect(planTeamV2AwardPlaces('group', partitions, prizes, [ruling], 8)).toEqual({
      ok: true, awards: [
        { prize_id: 'gold', group_id: 'group', place: 1,
          institution_key: 'Top', decided_by: 'total_points' },
        { prize_id: 'silver', group_id: 'group', place: 2,
          institution_key: 'School B', decided_by: 'documented_arbiter_ruling' },
        { prize_id: 'bronze', group_id: 'group', place: 3,
          institution_key: 'School A', decided_by: 'documented_arbiter_ruling' },
      ],
    });
  });
  it('refuses an exhausted money tie with no documented approved order', () => {
    expect(planTeamV2AwardPlaces('group', partitions, prizes, [], 8))
      .toEqual({ ok: false, reason: 'missing_ruling' });
  });
  it('refuses a false or stale decision, mismatched place and duplicate claim', () => {
    for (const bad of [
      { ...ruling, allocation_version: 7 },
      { ...ruling, group_id: 'other' },
      { ...ruling, affected_places: [3, 2] },
      { ...ruling, ordered_team_keys: ['School A', 'Top'] },
      { ...ruling, award_instructions: [{ place: 2, institution_key: 'School A' }, ruling.award_instructions[1]] },
    ]) {
      expect(planTeamV2AwardPlaces('group', partitions, prizes, [bad], 8).ok).toBe(false);
    }
    expect(planTeamV2AwardPlaces('group', partitions, prizes, [ruling, ruling], 8).ok).toBe(false);
  });
  it('fails closed on a scorer partition with an unknown status instead of awarding it', () => {
    const corrupted = [
      partitions[0],
      { ...partitions[1], status: 'unknown' } as unknown as TeamRankingPartition,
      partitions[2],
    ];
    expect(planTeamV2AwardPlaces('group', corrupted, prizes, [ruling], 8))
      .toEqual({ ok: false, reason: 'invalid_inputs' });
  });

  it('rejects rulings with a stale base version or missing official decision proof', () => {
    const unverified: TeamRulingRecord[] = [
      { ...ruling, supersedes_allocation_version: 5 },
      { ...ruling, schema_version: 1 as 2 },
      { ...ruling, actor_id: ' ' },
      { ...ruling, regulation_reference: ' ' },
      { ...ruling, arbiter_decision_reference: ' ' },
      { ...ruling, explanation: ' ' },
    ];
    for (const bad of unverified) {
      expect(planTeamV2AwardPlaces('group', partitions, prizes, [bad], 8).ok)
        .toBe(false);
    }
  });

  it('does not decide a money prize with missing/unverified tie-break evidence', () => {
    const blocked: TeamRankingPartition[] = [
      partitions[0], { status: 'blocked', reason: 'missing_tb', teams: partitions[1].teams },
    ];
    expect(planTeamV2AwardPlaces('group', blocked, prizes, [], 8))
      .toEqual({ ok: false, reason: 'blocked_ranking' });
  });
  it('allows an unawarded tied partition outside configured prize places to remain tied', () => {
    const onlyFirstPlace = [{ id: 'gold', place: 1 }];
    const result = planTeamV2AwardPlaces('group', partitions, onlyFirstPlace, [], 8);
    expect(result).toEqual({ ok: true, awards: [
      { prize_id: 'gold', group_id: 'group', place: 1,
        institution_key: 'Top', decided_by: 'total_points' },
    ] });
  });
  it('rejects duplicate prize positions and avoids invented money recipients', () => {
    expect(planTeamV2AwardPlaces('group', partitions, [
      ...prizes, { id: 'fourth-place', place: 3 },
    ], [ruling], 8)).toEqual({ ok: false, reason: 'invalid_inputs' });
    expect(planTeamV2AwardPlaces('group', [], prizes, [ruling], 8))
      .toEqual({ ok: false, reason: 'invalid_inputs' });
  });
  it('does not populate a prize place beyond the eligible candidate list', () => {
    const all = [...prizes, { id: 'fifth', place: 5 }];
    const result = planTeamV2AwardPlaces('group', partitions, all, [ruling], 8);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.awards.some(a => a.place === 5)).toBe(false);
  });
});
