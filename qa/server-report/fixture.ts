import { generateHtmlReport, type TeamPrizeResults } from '../../supabase/functions/_shared/prizePrintableHtml.ts';

const long = new URLSearchParams(window.location.search).has('long');
const count = long ? 14 : 4;
const names = ['Open Institution Awards', 'Junior Girls Institution Awards', 'Youth Open Institution Awards'];
const teams: TeamPrizeResults = {
  players_loaded: 0, max_rank: 0,
  groups: names.map((name, groupIndex) => ({
    group_id: 'synthetic-group-' + groupIndex, name,
    config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'sum' },
    eligible_institutions: count, ineligible_institutions: 1, ineligible_reasons: [],
    snapshot_award_count: count,
    prizes: Array.from({ length: count }, (_, index) => ({
      id: 'synthetic-prize-' + groupIndex + '-' + index, place: index + 1,
      cash_amount: 15000 - index * 800, has_trophy: index === 0, has_medal: index === 1, is_active: true,
      winner_institution: {
        key: 'synthetic-institution-' + groupIndex + '-' + index,
        label: 'Synthetic International Chess Academy ' + (groupIndex + 1) + ' — Institution ' + (index + 1),
        total_points: 10 + index, rank_sum: index + 2, best_individual_rank: index + 1,
        players: Array.from({ length: 2 }, (_, idx) => ({
          player_id: 'synthetic-player-' + groupIndex + '-' + index + '-' + idx,
          name: 'Fixture Player ' + groupIndex + '-' + index + '-' + idx + ' With Longer Surname',
          rank: index * 2 + idx + 1, points: 4 + idx, gender: null,
        })),
      },
    })),
  })),
};
const html = generateHtmlReport(
  { title: 'Synthetic Tournament - QA Only', start_date: '2026-10-03', end_date: '2026-10-04', venue: 'Fixture Hall' },
  [{ players: { rank: 1, name: 'Synthetic Individual Winner' },
     prizes: { categories: { name: 'Main' }, place: 1, cash_amount: 1000, has_trophy: true, has_medal: false } }],
  5, teams, null,
);
document.open();
document.write(html);
document.close();
