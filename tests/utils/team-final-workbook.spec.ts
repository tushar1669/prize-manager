import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';
import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';

const mocks = vi.hoisted(() => ({
  count: 1,
  error: null as null | { message: string },
  fetchTeams: vi.fn(),
  downloadXlsx: vi.fn(),
  select: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        mocks.select(...args);
        return {
          eq: () => ({ eq: async () => ({ count: mocks.count, error: mocks.error }) }),
        };
      },
    }),
  },
}));
vi.mock('@/components/team-prizes/useTeamPrizeResults', () => ({
  fetchTeamPrizeResults: (...args: unknown[]) => mocks.fetchTeams(...args),
}));
vi.mock('@/utils/excel', () => ({
  sanitizeFilename: (title: string) => title.replace(/[^\w.-]+/g, '_'),
  downloadWorkbookXlsx: (...args: unknown[]) => mocks.downloadXlsx(...args),
}));

import { buildTeamPrizeExportRows } from '@/utils/teamPrizeExport';
import { downloadFinalPrizeWorkbook } from '@/utils/finalPrizeWorkbook';

const teams: TeamPrizeResultsResponse = {
  players_loaded: 6, max_rank: 8,
  groups: [
    {
      group_id: 'fixture-group', name: 'Institution Awards',
      eligible_institutions: 2, ineligible_institutions: 1,
      ineligible_reasons: ['fixture-exclusion'],
      config: { group_by: 'club', team_size: 2, female_slots: 0, male_slots: 0, scoring_mode: 'sum' },
      prizes: [
        {
          id: 'team-second', place: 2, cash_amount: 2500,
          has_trophy: false, has_medal: true, is_active: true,
          winner_institution: {
            key: 'synthetic-two', label: 'Synthetic Academy B', total_points: 7,
            rank_sum: 9, best_individual_rank: 4,
            players: [{ player_id: 'p3', name: 'Fixture Person C', rank: 4, points: 4, gender: null }],
          },
        },
        {
          id: 'team-first', place: 1, cash_amount: 5000,
          has_trophy: true, has_medal: false, is_active: true,
          winner_institution: {
            key: 'synthetic-one', label: 'Synthetic Academy A', total_points: 11,
            rank_sum: 3, best_individual_rank: 1,
            players: [{ player_id: 'p1', name: 'Fixture Person A', rank: 1, points: 6, gender: null }],
          },
        },
        {
          id: 'team-unfilled', place: 3, cash_amount: 1000,
          has_trophy: false, has_medal: false, is_active: true,
          winner_institution: null,
        },
      ],
    },
  ],
};

const individual: FinalPrizeWinnerRow[] = [{
  prizeId: 'p-individual', categoryId: 'main', categoryName: 'Main Prizes',
  categoryOrder: 0, isMain: true, place: 1,
  playerId: 'p1', playerName: 'Synthetic Person A',
  rank: 1, amount: 12000, hasTrophy: true, hasMedal: false,
  hasGift: false, giftItems: [], club: null, state: null,
}];

beforeEach(() => {
  mocks.count = 1;
  mocks.error = null;
  mocks.fetchTeams.mockReset();
  mocks.downloadXlsx.mockReset();
  mocks.select.mockReset();
  mocks.fetchTeams.mockResolvedValue(teams);
  mocks.downloadXlsx.mockReturnValue(true);
});

describe('Team Prizes worksheet data and access', () => {
  it('exports FILLED team awards in place order; never exports unfilled/ineligible institutions', () => {
    const rows = buildTeamPrizeExportRows(teams, true);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.Place)).toEqual([1, 2]);
    expect(rows.map(r => r['Team / Institution'])).toEqual(['Synthetic Academy A', 'Synthetic Academy B']);
    expect(rows[0]['Team Players']).toBe('Fixture Person A (#1)');
    expect(rows[0]['Cash Amount']).toBe(5000);
    expect(rows[0].Trophy).toBe('Yes');
    expect(rows[1].Medal).toBe('Yes');
    expect(JSON.stringify(rows)).not.toContain('fixture-exclusion');
    expect(rows.some(r => r.Place === 3)).toBe(false);
    expect(buildTeamPrizeExportRows(teams, false)).toEqual([]);
  });

  it('writes exactly the three original individual sheets plus Team Prizes, with matching team data', async () => {
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', title: 'Synthetic Final', winners: individual,
      hasFullAccess: true, teamAllocationVersion: 5,
    });
    expect(result).toMatchObject({ ok: true, winnerCount: 1, teamCount: 2 });
    expect(mocks.fetchTeams).toHaveBeenCalledWith('t-synthetic', 5);
    expect(mocks.downloadXlsx).toHaveBeenCalledTimes(1);
    const [filename, sheets] = mocks.downloadXlsx.mock.calls[0];
    expect(filename).toMatch(/^Synthetic_Final_final_prizes_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Object.keys(sheets)).toEqual(['Winners', 'Poster Grid', 'Arbiter Sheet', 'Team Prizes']);
    expect(sheets['Poster Grid']).toEqual(sheets.Winners);
    expect(sheets['Arbiter Sheet'][0].Signature).toBe('');
    expect(sheets['Team Prizes']).toHaveLength(2);
  });

  it('allows team-only results to be exported without an individual winner', async () => {
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', title: 'Only Teams', winners: [], hasFullAccess: true,
    });
    expect(result).toMatchObject({ ok: true, winnerCount: 0, teamCount: 2 });
  });

  it('always includes an empty fourth sheet if no team groups are configured', async () => {
    mocks.count = 0;
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', winners: individual, hasFullAccess: true,
    });
    expect(result).toMatchObject({ ok: true, winnerCount: 1, teamCount: 0 });
    expect(mocks.fetchTeams).not.toHaveBeenCalled();
    expect(mocks.downloadXlsx.mock.calls[0][1]['Team Prizes']).toEqual([]);
  });

  it('fails closed if team data cannot be loaded rather than silently dropping awarded teams', async () => {
    mocks.fetchTeams.mockRejectedValue(new Error('fixture fetch failure'));
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', winners: individual, hasFullAccess: true,
    });
    expect(result).toEqual({ ok: false, reason: 'team_data_unavailable' });
    expect(mocks.downloadXlsx).not.toHaveBeenCalled();
  });

  it('fails closed when configured team groups unexpectedly resolve to an empty result', async () => {
    mocks.fetchTeams.mockResolvedValue({ ...teams, groups: [] });
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', winners: individual, hasFullAccess: true,
    });
    expect(result).toEqual({ ok: false, reason: 'team_data_unavailable' });
    expect(mocks.downloadXlsx).not.toHaveBeenCalled();
  });

  it('does not query or export when full access is denied', async () => {
    const result = await downloadFinalPrizeWorkbook({
      tournamentId: 't-synthetic', winners: individual, hasFullAccess: false,
    });
    expect(result).toEqual({ ok: false, reason: 'access_denied' });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.fetchTeams).not.toHaveBeenCalled();
    expect(mocks.downloadXlsx).not.toHaveBeenCalled();
  });
});
