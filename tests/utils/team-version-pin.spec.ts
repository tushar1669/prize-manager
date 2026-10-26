import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  allocations: [] as Array<Record<string, unknown>>,
  errorFor: '' as string,
  invoke: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => {
  const tableResult = (table: string) => ({
    data: table === 'institution_prize_groups'
      ? [{ id: 'fixture-group', name: 'Team Trophy', group_by: 'club', team_size: 2,
           female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score' }]
      : table === 'institution_prizes'
        ? [{ id: 'fixture-prize', group_id: 'fixture-group', place: 1, cash_amount: 1000,
             has_medal: false, has_trophy: true }]
        : table === 'team_allocations' ? mocks.allocations : [],
    error: mocks.errorFor === table ? { message: 'fixture read error' } : null,
  });
  const tableQuery = (table: string) => {
    const query = {
      select: () => query, eq: () => query, in: () => query,
      order: async () => tableResult(table),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(tableResult(table)).then(resolve, reject),
    };
    return query;
  };
  return {
    supabase: {
      from: (table: string) => tableQuery(table),
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
      functions: { invoke: mocks.invoke },
    },
  };
});

import { fetchTeamPrizeResults } from '@/components/team-prizes/useTeamPrizeResults';

describe('version-pinned team prize queries', () => {
  it('never uses the live allocator when the requested version has no team allocation rows', async () => {
    mocks.allocations = [];
    mocks.errorFor = '';
    mocks.invoke.mockReset();
    const result = await fetchTeamPrizeResults('pin-missing-rows', 7);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].prizes[0].winner_institution).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects a failed historical read instead of falling back to current prizes', async () => {
    mocks.allocations = [];
    mocks.errorFor = 'team_allocations';
    mocks.invoke.mockReset();
    await expect(fetchTeamPrizeResults('pin-db-failure', 8)).rejects.toThrow('Version-pinned');
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.errorFor = '';
  });

  it('rejects noninteger and invalid historical versions', async () => {
    mocks.invoke.mockReset();
    await expect(fetchTeamPrizeResults('pin-invalid', 'NaN')).rejects.toThrow('Invalid team allocation version');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

describe('Final Prize Team tab uses the same allocation version as individual results', () => {
  it('passes the selected saved version into Team Prizes, preserving draft preview for no version', () => {
    const page = readFileSync('src/pages/FinalPrizeView.tsx', 'utf8');
    expect(page).toContain('useFinalPrizeData(id)');
    expect(page).toContain('allocationVersion={data.version ?? undefined}');
  });
});
