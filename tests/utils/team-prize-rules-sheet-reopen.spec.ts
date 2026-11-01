// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstitutionPrizeGroup } from '@/components/team-prizes/types';

vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isMaster: true, authzStatus: 'ready' }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

import TeamPrizeRulesSheet from '@/components/team-prizes/TeamPrizeRulesSheet';

const saved = {
  version: 2, source_hash: null, published_reference: 'Saved brochure clause',
  organizer_confirmed: true,
  criteria: [{ kind: 'best_rank' }, { kind: 'score_vector' }, { kind: 'imported_tbs' }],
};
const group = {
  id: 'g1', tournament_id: 't1', name: 'BEST SCHOOL', group_by: 'club', team_size: 4,
  female_slots: 0, male_slots: 0, scoring_mode: 'by_top_k_score', is_active: true,
  ranking_rules: saved,
} as unknown as InstitutionPrizeGroup;

// Mirrors TeamPrizesEditor: one sheet whose open/group state is set by the
// "Edit Rules" button and cleared after a save.
function Parent() {
  const [sheet, setSheet] = useState<{ open: boolean; group: Partial<InstitutionPrizeGroup> | null }>({ open: false, group: null });
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: () => setSheet({ open: true, group }) }, 'Edit Rules'),
    React.createElement('button', { onClick: () => setSheet({ open: true, group: null }) }, 'Add Group'),
    React.createElement(TeamPrizeRulesSheet, {
      open: sheet.open,
      onOpenChange: (open: boolean) => setSheet({ open, group: sheet.group }),
      group: sheet.group, tournamentId: 't1',
      onSave: async () => { setSheet({ open: false, group: null }); },
    }));
}

const stepTitles = () => screen.getAllByText(/^\d\. (Highest individual scores|Best individual rank|Imported individual tie-breaks)$/).map(e => e.textContent);
const reference = () => (screen.getByLabelText('Published team-prize rules reference') as HTMLInputElement).value;
const confirmBox = () => screen.getByRole('checkbox', { name: /ranking order reflects the declared/ });

afterEach(cleanup);

describe('Edit Rules drawer shows the saved ranking rules every time it opens', () => {
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const mount = () => render(React.createElement(QueryClientProvider, { client: client() }, React.createElement(Parent)));
  const expectSaved = async () => {
    await waitFor(() => expect(reference()).toBe('Saved brochure clause'));
    expect(stepTitles()).toEqual(['2. Best individual rank', '3. Highest individual scores', '4. Imported individual tie-breaks']);
    expect(confirmBox().getAttribute('data-state')).toBe('checked');
  };

  it('first open', async () => {
    mount();
    fireEvent.click(screen.getByText('Edit Rules'));
    await expectSaved();
  });

  it('a new group still starts with the default order, unconfirmed', async () => {
    mount();
    fireEvent.click(screen.getByText('Add Group'));
    await waitFor(() => expect(stepTitles()).toEqual(['2. Highest individual scores', '3. Best individual rank', '4. Imported individual tie-breaks']));
    expect(reference()).toBe('');
    expect(confirmBox().getAttribute('data-state')).toBe('unchecked');
  });

  it('after saving and reopening (same page, no reload)', async () => {
    mount();
    fireEvent.click(screen.getByText('Edit Rules'));
    await expectSaved();
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(screen.queryByText('Save Changes')).toBeNull());
    fireEvent.click(screen.getByText('Edit Rules'));
    await expectSaved();
  });
});
