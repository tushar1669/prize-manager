// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamRankingRuleConfig } from '@/utils/teamRankingV2';

// The editor reads the latest successful import's detected TB columns.
// Synthetic metadata only: two TB columns, no player data.
vi.mock('@/integrations/supabase/client', () => {
  const rows = [{
    file_hash: 'synthetic-file-hash',
    imported_at: '2026-10-31T00:00:00Z',
    meta: {
      import_success: true,
      individual_tb_columns: [
        { ordinal: 1, header: 'TB1', duplicate: false, present: 20, missing: 0, invalid: 0 },
        { ordinal: 2, header: 'TB2', duplicate: false, present: 20, missing: 0, invalid: 0 },
      ],
    },
  }];
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { supabase: { from: () => chain } };
});

import { TeamRankingRulesEditor } from '@/components/team-prizes/TeamRankingRulesEditor';

let latest: TeamRankingRuleConfig | null = null;

function Harness({ initial }: { initial: TeamRankingRuleConfig | null }) {
  const [value, setValue] = useState<TeamRankingRuleConfig | null>(initial);
  return React.createElement(TeamRankingRulesEditor, {
    tournamentId: 'synthetic-tournament',
    open: true,
    value,
    onChange: (next: TeamRankingRuleConfig) => { latest = next; setValue(next); },
  });
}

function renderEditor(initial: TeamRankingRuleConfig | null = null) {
  latest = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { initial })));
}

const tbRule = (ordinal: number) => latest?.criteria.find(rule => rule.kind === 'source_tb' && rule.ordinal === ordinal);
const confirmBoxes = () => screen.getAllByRole('checkbox', { name: /summing this individual TB/ });

afterEach(() => cleanup());

describe('Team ranking rules — tie-break name dropdown', () => {
  it('offers the standard methods plus Other for each TB column found in the import', async () => {
    renderEditor();
    const select = await screen.findByLabelText('What is TB1 in this tournament?') as HTMLSelectElement;
    expect(await screen.findByLabelText('What is TB2 in this tournament?')).toBeTruthy();
    const options = Array.from(select.options).map(option => option.textContent);
    expect(options[0]).toMatch(/Choose the tie-break/);
    expect(options).toContain('Buchholz Cut-1 (BH-C1)');
    expect(options).toContain('Sonneborn-Berger (SB)');
    expect(options[options.length - 1]).toMatch(/^Other/);
  });

  it('picking a standard method stores its name and "higher wins", and needs a fresh confirmation', async () => {
    renderEditor();
    const select = await screen.findByLabelText('What is TB1 in this tournament?');
    fireEvent.change(select, { target: { value: 'bh_c1' } });
    expect(tbRule(1)).toMatchObject({ name: 'Buchholz Cut-1', direction: 'higher', verified: false, aggregation: 'sum' });
    expect(screen.getByText(/sum of the counted players' TB1 values · higher total wins/)).toBeTruthy();
    expect(screen.getByText(/Individual TB1 · Buchholz Cut-1/)).toBeTruthy();
    // Now confirmable; the persisted shape is unchanged (no extra keys).
    const box = confirmBoxes()[0];
    expect((box as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(box);
    expect(tbRule(1)).toEqual({ kind: 'source_tb', ordinal: 1, name: 'Buchholz Cut-1', aggregation: 'sum', direction: 'higher', verified: true });
  });

  it('Direct Encounter is explained and cannot be confirmed for summing', async () => {
    renderEditor();
    const select = await screen.findByLabelText('What is TB2 in this tournament?');
    fireEvent.change(select, { target: { value: 'de' } });
    expect(tbRule(2)).toMatchObject({ name: 'Direct Encounter', verified: false });
    expect(screen.getByText(/cannot be added up for a team/)).toBeTruthy();
    expect((confirmBoxes()[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('Other opens a text box that stays open while typing a short standard-looking name', async () => {
    renderEditor();
    const select = await screen.findByLabelText('What is TB1 in this tournament?') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'other' } });
    const box = screen.getByLabelText('Exact name of TB1') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'SB' } });
    expect(screen.getByLabelText('Exact name of TB1')).toBeTruthy();
    expect(select.value).toBe('other');
    expect(tbRule(1)).toMatchObject({ name: 'SB', verified: false });
    // A custom method shows the manual direction choice; an unchosen TB does not.
    expect(document.getElementById('direction-1')).not.toBeNull();
    expect(document.getElementById('direction-2')).toBeNull();
    expect(screen.getByText(/Pick what TB2 means in this event/)).toBeTruthy();
  });

  it('a previously typed standard spelling pre-selects the matching method', async () => {
    renderEditor({
      version: 2,
      source_hash: 'synthetic-file-hash',
      published_reference: 'Synthetic brochure clause 4',
      organizer_confirmed: false,
      criteria: [
        { kind: 'score_vector' },
        { kind: 'source_tb', ordinal: 1, name: 'BH-C1', aggregation: 'sum', direction: 'higher', verified: false },
        { kind: 'source_tb', ordinal: 2, name: '', aggregation: 'sum', direction: 'higher', verified: false },
      ],
    });
    const select = await screen.findByLabelText('What is TB1 in this tournament?') as HTMLSelectElement;
    expect(select.value).toBe('bh_c1');
    const second = screen.getByLabelText('What is TB2 in this tournament?') as HTMLSelectElement;
    expect(second.value).toBe('');
  });
});
