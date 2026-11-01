// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Team V2 ranking steps are Master-operated: only a Master can enable V2 for a
// tournament and save its results. Organizers must not see steps that the
// standard engine would ignore.
const role = vi.hoisted(() => ({ isMaster: false, authzStatus: 'ready' as 'loading' | 'ready' | 'error' }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => role }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

import TeamPrizeRulesSheet from '@/components/team-prizes/TeamPrizeRulesSheet';

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client },
    React.createElement(TeamPrizeRulesSheet, {
      open: true, onOpenChange: () => {}, group: null,
      tournamentId: 'synthetic-tournament', onSave: async () => {},
    })));
}

afterEach(() => { cleanup(); role.isMaster = false; role.authzStatus = 'ready'; });

describe('Team prize drawer — Team V2 steps are shown only to a Master', () => {
  it('an organizer sees the standard drawer without Team V2 ranking steps', async () => {
    renderSheet();
    expect(await screen.findByText('Team Size')).toBeTruthy();
    expect(screen.queryByText(/Ranking & tie-breaks/)).toBeNull();
  });

  it('a Master sees the Team V2 steps, labelled as applying only to Team V2 tournaments', async () => {
    role.isMaster = true;
    renderSheet();
    expect(await screen.findByText(/Ranking & tie-breaks/)).toBeTruthy();
    expect(screen.getByText(/Team Prizes V2 only/)).toBeTruthy();
  });

  it('while the role is still loading, nothing V2 is shown even for a Master', async () => {
    role.isMaster = true;
    role.authzStatus = 'loading';
    renderSheet();
    expect(await screen.findByText('Team Size')).toBeTruthy();
    expect(screen.queryByText(/Ranking & tie-breaks/)).toBeNull();
  });
});
