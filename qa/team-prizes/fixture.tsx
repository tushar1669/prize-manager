import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeamPrizeResultsPanel } from '../../src/components/allocation/TeamPrizeResultsPanel';
import type { TeamPrizeResultsResponse } from '../../src/components/team-prizes/useTeamPrizeResults';
import '../../src/index.css';
import '../../src/components/final-prize/TeamPrizesTabView.css';

const long = new URLSearchParams(window.location.search).has('long');
const restricted = new URLSearchParams(window.location.search).has('restricted');
const diagnostics = new URLSearchParams(window.location.search).has('diagnostics');
const groups = ['Open Institution Awards', 'Junior Girls Institution Awards', 'Youth Open Institution Awards'];
const prizesPerGroup = long ? 14 : 4;
const data: TeamPrizeResultsResponse = {
  players_loaded: groups.length * prizesPerGroup * 2, max_rank: groups.length * prizesPerGroup * 2,
  groups: groups.map((name, groupIndex) => ({
    group_id: `synthetic-group-${groupIndex + 1}`,
    name,
    config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'sum' },
    eligible_institutions: prizesPerGroup + 1,
    ineligible_institutions: 1,
    ineligible_reasons: ['EXCLUDED_NEVER_PRINT'],
    ineligible_details: [{ key: 'EXCLUDED_NEVER_PRINT', reason: 'team_short_roster', playerCount: 1 }],
    prizes: Array.from({ length: prizesPerGroup }, (_, index) => ({
      id: `synthetic-team-award-${groupIndex + 1}-${index + 1}`,
      place: index + 1, cash_amount: 15000 - index * 800,
      has_trophy: index === 0, has_medal: index === 1, is_active: true,
      winner_institution: {
        key: `fixture-institution-${groupIndex}-${index}`,
        label: `Synthetic International Chess Academy ${groupIndex + 1} — Institution ${index + 1}`,
        total_points: 10 + index, rank_sum: 4 + index, best_individual_rank: index + 1,
        players: Array.from({ length: 2 }, (_, p) => ({
          player_id: `splayer-${groupIndex}-${index}-${p}`,
          name: `Synthetic Player ${groupIndex + 1}-${index + 1}-${p + 1} With Long Surname`,
          rank: (index * 2) + p + 1, points: 4 + p, gender: null,
        })),
      },
    })),
  })),
};
createRoot(document.getElementById('root')!).render(
  <div className="pm-print-page">
    <header className="pm-print-header" style={{margin:'12px 20px',textAlign:'center',borderBottom:'2px solid #b38a32',paddingBottom:'10px'}}>
      <h1 style={{fontSize:'22px',fontWeight:800}}>Synthetic Team Prize Results</h1>
      <p>Prize Manager · Team / Institution Prizes</p>
    </header>
    <main className="pm-print-surface pm-team-prizes-print" style={{padding:'8px 20px'}}>
      <TeamPrizeResultsPanel data={data} hasFullAccess={!restricted} showDiagnostics={diagnostics} />
    </main>
  </div>
);
