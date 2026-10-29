import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateHtmlReport, type TeamPrizeResults } from '../../supabase/functions/_shared/prizePrintableHtml';

const teams: TeamPrizeResults = {
  groups: [{ group_id: 'group', name: 'Fixture Club Awards',
    config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'sum' },
    eligible_institutions: 1, ineligible_institutions: 0, ineligible_reasons: [],
    snapshot_award_count: 1,
    prizes: [{ id: 'one', place: 1, cash_amount: 1250, has_trophy: true,
      has_medal: false, is_active: true, winner_institution: {
        key: 'team', label: 'Synthetic & Team <script>',
        total_points: 7, rank_sum: 3, best_individual_rank: 1,
        players: [{ player_id: 'p1', name: 'Fixture <Player>', rank: 1, points: 4, gender: null },
          { player_id: 'p2', name: 'Other Fixture', rank: 2, points: 3, gender: null }],
      },
    }],
  }], players_loaded: 0, max_rank: 0,
};
const tournament = { title: 'Synthetic & Title', start_date: '2026-10-03', end_date: '2026-10-04', venue: 'Fixture Hall' };

describe('generatePdf pure printable HTML contract', () => {
  it('preserves exact four-column team report, saved winners and version', () => {
    const html = generateHtmlReport(tournament, [], 5, teams, null);
    expect(html).toContain('Prize Allocations v5');
    for (const label of ['Place', 'Institution', 'Points', 'Prize']) expect(html).toContain('<th>' + label + '</th>');
    expect(html).toContain('data-team-tone="gold"');
    expect(html).toContain('pm-team-table');
    expect(html).toContain('₹1250');
    expect(html).toContain('Fixture &lt;Player&gt;');
    expect(html).toContain('Synthetic &amp; Team &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('preserves fail-closed team section error and empty state without invented winners', () => {
    expect(generateHtmlReport(tournament, [], 5, null, 'unavailable')).toContain('Team prizes could not be included');
    expect(generateHtmlReport(tournament, [], 5, { ...teams, groups: [] }, null)).not.toContain('pm-team-table');
  });
  it('keeps original Edge authorization and pinned data-URI response unchanged', () => {
    const source = readFileSync('supabase/functions/generatePdf/index.ts', 'utf8');
    expect(source).toContain("generateHtmlReport(tournament, allocations, version, teamPrizeResults, teamPrizeError)");
    expect(source).toContain("data:text/html;base64");
    expect(source).toContain("tournamentAccess.owner_id !== user.id && !isMaster");
    expect(source).toContain(".eq('version', version)");
    expect(source).toContain("if (!accessState?.has_full_access)");
    expect(source).not.toContain("functions.invoke('allocateInstitutionPrizes'");
  });
});
