import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { TeamPrizeResultsPanel } from '@/components/allocation/TeamPrizeResultsPanel';
import type { TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';

const config = {
  group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score',
};
const groups: TeamPrizeResultsResponse['groups'] = ['Main Team Award', 'Junior Team Award', 'Open Team Award'].map(
  (name, groupIndex) => ({
    group_id: `synthetic-group-${groupIndex + 1}`,
    name,
    config,
    eligible_institutions: 4,
    ineligible_institutions: 1,
    ineligible_reasons: ['team_short_roster'],
    prizes: [{
      id: `synthetic-prize-${groupIndex + 1}`,
      place: 1,
      cash_amount: 5000 + groupIndex * 1000,
      has_trophy: groupIndex === 0,
      has_medal: groupIndex === 1,
      is_active: true,
      winner_institution: {
        key: `fixture-institution-${groupIndex + 1}`,
        label: `Synthetic Academy ${groupIndex + 1}`,
        total_points: 12 + groupIndex,
        rank_sum: 9 + groupIndex,
        best_individual_rank: 2 + groupIndex,
        players: [
          { player_id: `fixture-p-${groupIndex}-a`, name: 'Synthetic Winner One', rank: 1, points: 7, gender: null },
          { player_id: `fixture-p-${groupIndex}-b`, name: 'Synthetic Winner Two', rank: 2, points: 5, gender: null },
        ],
      },
    }],
  })
);
const data: TeamPrizeResultsResponse = { groups, players_loaded: 24, max_rank: 40 };
afterEach(cleanup);

describe('Team Prize print-only branding', () => {
  it('preserves all original group names, winners, columns, prizes and typography targets', () => {
    const { container } = render(createElement('div', { className: 'pm-team-prizes' },
      createElement(TeamPrizeResultsPanel, { data, hasFullAccess: true, showDiagnostics: false })));
    const groupCards = container.querySelectorAll('.pm-team-prize-group');
    expect(groupCards).toHaveLength(3);
    for (let index = 0; index < 3; index++) {
      expect(groupCards[index].textContent).toContain(groups[index].name);
      expect(groupCards[index].textContent).toContain(`Synthetic Academy ${index + 1}`);
      expect(groupCards[index].querySelectorAll('thead th')).toHaveLength(6);
      expect(groupCards[index].querySelectorAll('tbody tr')).toHaveLength(1);
      expect(groupCards[index].querySelectorAll('tbody td')).toHaveLength(6);
    }
    expect(screen.getAllByText(/Synthetic Winner One/)).toHaveLength(3);
    expect(screen.queryByText(/ineligible team/)).toBeNull();
  });

  it('retains organizer access masking when full access is unavailable', () => {
    const { container } = render(createElement('div', { className: 'pm-team-prizes' },
      createElement(TeamPrizeResultsPanel, { data, hasFullAccess: false, showDiagnostics: false })));
    expect(container.querySelectorAll('.pm-team-prize-group')).toHaveLength(3);
    expect(screen.queryByText('Synthetic Academy 1')).toBeNull();
    expect(screen.getAllByText(/Locked — upgrade to Pro/)).toHaveLength(3);
  });
});
