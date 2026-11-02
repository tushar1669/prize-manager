// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => { cleanup(); });

describe('Team prize drawer — ranking steps are shown to every user', () => {
  it('an organizer sees Ranking & tie-breaks, with no "Team Prizes V2 only" label', async () => {
    renderSheet();
    expect(await screen.findByText('Team Size')).toBeTruthy();
    expect(await screen.findByText(/Ranking & tie-breaks/)).toBeTruthy();
    expect(screen.queryByText(/Team Prizes V2 only/)).toBeNull();
  });
});
