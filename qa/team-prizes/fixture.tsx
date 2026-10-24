import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeamPrizeResultsPanel } from '../../src/components/allocation/TeamPrizeResultsPanel';
import type { TeamPrizeResultsResponse } from '../../src/components/team-prizes/useTeamPrizeResults';
import '../../src/index.css';
import '../../src/components/final-prize/TeamPrizesTabView.css';

const long = new URLSearchParams(location.search).get('size') === 'long';
const restricted = new URLSearchParams(location.search).get('access') === 'restricted';
const n = long ? 9 : 3;
const groups: TeamPrizeResultsResponse['groups'] = Array.from({length:n}, (_,i) => ({
  group_id: `synthetic-team-group-${i+1}`,
  name: `Synthetic Team Award Group ${i+1} — ${['Main','Under 12','Open'][i%3]}`,
  config: {group_by:'club',team_size:3,female_slots:0,male_slots:0,scoring_mode:'by_top_k_score'},
  eligible_institutions: 6, ineligible_institutions: 0, ineligible_reasons: [],
  prizes: Array.from({length:4},(_,j)=>({
    id:`synthetic-team-prize-${i}-${j}`,place:j+1,cash_amount:15000/(j+1),
    has_trophy:j===0,has_medal:j===1,is_active:true,
    winner_institution:{
      key:`fixture-institution-${i}-${j}`,label:`Synthetic International Academy of Chess and Sports Club ${i+1} / ${j+1}`,
      total_points:25-j,rank_sum:9+j,best_individual_rank:2+j,
      players:Array.from({length:3},(_,k)=>({player_id:`synthetic-${i}-${j}-${k}`,name:`Synthetic Team Player ${k+1}`,rank:k+1,points:8-k,gender:null}))
    }
  }))
}));
const response:TeamPrizeResultsResponse={groups,players_loaded:150,max_rank:150};
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><div className="pm-print-page"><header className="pm-print-header">SYNTHETIC TEST TOURNAMENT — Team Prizes</header><main className="pm-print-surface pm-team-prizes">
    <TeamPrizeResultsPanel data={response} isLoading={false} error={null} hasFullAccess={!restricted} showDiagnostics={false} />
  </main></div></React.StrictMode>
);
