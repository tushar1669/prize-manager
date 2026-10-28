import { describe, expect, it } from 'vitest';
import { detectTeamTiesAtBoundary, hasUnresolvedTeamTies } from '@/utils/teamTieDetection';
import type { GroupResponse } from '@/components/team-prizes/useTeamPrizeResults';

const historicalFixture = (): GroupResponse => ({
  group_id: 'fixture-group',
  name: 'Fixture Team Award',
  config: {
    group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0,
    scoring_mode: 'by_top_k_score',
  },
  eligible_institutions: 2,
  ineligible_institutions: 0,
  ineligible_reasons: [],
  prizes: [
    {
      id: 'place-one', place: 1, cash_amount: 2500, has_trophy: true,
      has_medal: false, is_active: true,
      winner_institution: {
        key: 'Fixture A', label: 'Fixture A', total_points: 12,
        rank_sum: 3, best_individual_rank: 1, players: [],
      },
    },
    {
      id: 'place-two', place: 2, cash_amount: 1000, has_trophy: true,
      has_medal: false, is_active: true,
      winner_institution: {
        key: 'Fixture B', label: 'Fixture B', total_points: 12,
        rank_sum: 3, best_individual_rank: 1, players: [],
      },
    },
  ],
});

describe('legacy tie-resolution UI isolation from persisted Team Ranking v2', () => {
  it('preserves the old dialog detection for pre-v2 saved results', () => {
    const historical = historicalFixture();
    expect(detectTeamTiesAtBoundary(historical)?.affectedPlaces).toEqual([1, 2]);
    expect(hasUnresolvedTeamTies([historical])).toBe(true);
  });

  it('does not offer destructive legacy adjudication for a saved v2 winner', () => {
    const group = historicalFixture();
    group.prizes[0].winner_institution!.ranking_snapshot = {
      schema_version: 2,
      winner_key: 'Fixture A', decided_by_criterion: 'score_vector',
    };
    expect(detectTeamTiesAtBoundary(group)).toBeNull();
    expect(hasUnresolvedTeamTies([group])).toBe(false);
  });

  it('rejects a saved unknown audit rather than treating it as pre-v2 legacy', () => {
    const group = historicalFixture();
    group.prizes[1].winner_institution!.ranking_snapshot = { schema_version: 'unrecognized' };
    expect(detectTeamTiesAtBoundary(group)).toBeNull();
  });

  it('keeps the v2 preview partition guard, even when it contains no issues', () => {
    const group = historicalFixture();
    group.ranking_issues = [];
    expect(detectTeamTiesAtBoundary(group)).toBeNull();
    group.ranking_issues = ['Place 1: ranking tied'];
    expect(detectTeamTiesAtBoundary(group)).toBeNull();
    expect(hasUnresolvedTeamTies([group])).toBe(true);
  });
});
