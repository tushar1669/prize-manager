import { describe, expect, it } from 'vitest';
import { planAuthorizedTeamV2Awards } from '../../supabase/functions/_shared/teamV2CommitPlan';

const team = (key: string) => ({ key, selectedPlayers: [{ points: 6 }] });
const groups = [
  {
    group_id: 'group',
    organizer_confirmed: true,
    published_reference: 'event-regulations-4',
    prizes: [{ id: 'gold', place: 1 }, { id: 'silver', place: 2 }],
    partitions: [{ status: 'tied' as const, teams: [team('School A'), team('School B')] }],
  },
  {
    group_id: 'city',
    organizer_confirmed: true,
    published_reference: 'event-regulations-4',
    prizes: [{ id: 'city-gold', place: 1 }],
    partitions: [{ status: 'resolved' as const, criterion: 'total_points', teams: [team('City A')] }],
  },
];
const official = {
  group_id: 'group',
  next_allocation_version: 2,
  tied_team_keys: ['School A', 'School B'],
  ordered_team_keys: ['School B', 'School A'],
  affected_places: [1, 2],
  method: 'documented_arbiter_ruling',
  regulation_reference: 'event-regulations-4',
  arbiter_decision_reference: 'arbiter-decision-10',
  explanation: 'Official decision under the published regulations',
};
const context = {
  currentAllocationVersion: 1,
  actorId: 'authorized-owner',
  actorIsOwnerOrMaster: true,
  recordedAt: '2026-10-30T00:00:00Z',
};

describe('Team v2 authenticated official ruling → complete server-ranked award plan', () => {
  it('validates a real tied prize boundary, keeps unrelated resolved group and returns versioned ruling', () => {
    const result = planAuthorizedTeamV2Awards(groups, [{ group_id: 'group', proposal: official }], context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.awards).toEqual([
      { prize_id: 'gold', group_id: 'group', place: 1,
        institution_key: 'School B', decided_by: 'documented_arbiter_ruling' },
      { prize_id: 'silver', group_id: 'group', place: 2,
        institution_key: 'School A', decided_by: 'documented_arbiter_ruling' },
      { prize_id: 'city-gold', group_id: 'city', place: 1,
        institution_key: 'City A', decided_by: 'total_points' },
    ]);
    expect(result.rulings).toMatchObject([{
      schema_version: 2, group_id: 'group',
      allocation_version: 2, supersedes_allocation_version: 1,
      actor_id: 'authorized-owner', regulation_reference: 'event-regulations-4',
      award_instructions: [{ place: 1, institution_key: 'School B' },
        { place: 2, institution_key: 'School A' }],
    }]);
  });

  it('rejects missing, duplicate and off-group official orders', () => {
    expect(planAuthorizedTeamV2Awards(groups, [], context)).toMatchObject({
      ok: false, reason: 'missing_ruling',
    });
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'group', proposal: official },
      { group_id: 'group', proposal: official },
    ], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'elsewhere', proposal: official },
    ], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'city', proposal: { ...official, group_id: 'city' } },
    ], context).ok).toBe(false);
  });

  it('rejects unverified regulations, unapproved order, stale version and unauthorized actor', () => {
    expect(planAuthorizedTeamV2Awards([{ ...groups[0], organizer_confirmed: false }, groups[1]],
      [{ group_id: 'group', proposal: official }], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'group', proposal: { ...official, regulation_reference: 'different-rules' } },
    ], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'group', proposal: { ...official, ordered_team_keys: ['School A', 'Invented'] } },
    ], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'group', proposal: { ...official, next_allocation_version: 3 } },
    ], context).ok).toBe(false);
    expect(planAuthorizedTeamV2Awards(groups, [
      { group_id: 'group', proposal: official },
    ], { ...context, actorIsOwnerOrMaster: false }).ok).toBe(false);
  });

  it('cannot turn missing TB evidence into an official tie, even with an arbiter reference', () => {
    const incomplete = [{ ...groups[0], partitions: [
      { status: 'blocked' as const, reason: 'missing_tb', teams: groups[0].partitions[0].teams },
    ] }, groups[1]];
    expect(planAuthorizedTeamV2Awards(incomplete, [
      { group_id: 'group', proposal: official },
    ], context).ok).toBe(false);
  });

  it('permits uncontested, confirmed results without inventing a ruling', () => {
    const clear = [{ ...groups[1] }];
    const result = planAuthorizedTeamV2Awards(clear, [], context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rulings).toEqual([]);
  });
});
