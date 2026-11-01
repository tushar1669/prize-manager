// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamRankingRuleConfig } from '@/utils/teamRankingV2';

// The editor reads the latest successful import's detected TB columns.
// Synthetic metadata only: two TB columns, no player data.
const importMeta = vi.hoisted(() => ({ headers: ['TB1', 'TB2'] as string[] }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({
      data: [{
        file_hash: 'synthetic-file-hash',
        imported_at: '2026-10-31T00:00:00Z',
        meta: {
          import_success: true,
          individual_tb_columns: importMeta.headers.map((header, i) => (
            { ordinal: i + 1, header, duplicate: false, present: 20, missing: 0, invalid: 0 })),
        },
      }],
      error: null,
    }),
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

afterEach(() => { cleanup(); importMeta.headers = ['TB1', 'TB2']; });

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

  it('Swiss-Manager code headings pre-fill the dropdown but stay unconfirmed', async () => {
    importMeta.headers = ['BH:GP/C1', 'DE'];
    renderEditor();
    const first = await screen.findByLabelText('What is TB1 in this tournament?') as HTMLSelectElement;
    await screen.findByText(/Filled in from the column heading “BH:GP\/C1”/);
    expect(first.value).toBe('bh_c1');
    const second = screen.getByLabelText('What is TB2 in this tournament?') as HTMLSelectElement;
    expect(second.value).toBe('de');
    expect(tbRule(1)).toMatchObject({ name: 'Buchholz Cut-1', verified: false });
    expect(tbRule(2)).toMatchObject({ name: 'Direct Encounter', verified: false });
    expect(latest?.organizer_confirmed).toBe(false);
    expect((confirmBoxes()[0] as HTMLButtonElement).disabled).toBe(false);
    expect((confirmBoxes()[1] as HTMLButtonElement).disabled).toBe(true);
  });
  it('starts with Highest individual scores, then Best individual rank, then the imported tie-breaks', async () => {
    renderEditor();
    await screen.findByLabelText('What is TB1 in this tournament?');
    expect(latest?.criteria.map(c => c.kind === 'source_tb' ? `TB${c.ordinal}` : c.kind))
      .toEqual(['score_vector', 'best_rank', 'TB1', 'TB2']);
    expect(screen.getByText('2. Highest individual scores')).toBeTruthy();
    expect(screen.getByText('3. Best individual rank')).toBeTruthy();
    // Steps after Best individual rank can never be reached (ranks are unique).
    expect(screen.getAllByText(/Not reached: Best individual rank above always decides/)).toHaveLength(2);
  });

  it('a removed tie-break stays removed, can be added back, and does not block confirmation', async () => {
    renderEditor();
    await screen.findByLabelText('What is TB2 in this tournament?');
    fireEvent.click(screen.getByLabelText('Remove criterion 5')); // TB2
    expect(latest?.criteria.some(c => c.kind === 'source_tb' && c.ordinal === 2)).toBe(false);
    // Not silently re-added for the same imported file.
    expect(screen.queryByLabelText('What is TB2 in this tournament?')).toBeNull();
    fireEvent.change(screen.getByLabelText('Published team-prize rules reference'), { target: { value: 'Brochure clause 4' } });
    const confirm = screen.getByRole('checkbox', { name: /ranking order reflects the declared/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    // Add it back from the dropdown.
    const add = screen.getByLabelText('Add a tie-break step') as HTMLSelectElement;
    expect(Array.from(add.options).map(o => o.textContent)).toContain('TB2 · TB2');
    fireEvent.change(add, { target: { value: 'TB2' } });
    expect(latest?.criteria.map(c => c.kind === 'source_tb' ? `TB${c.ordinal}` : c.kind)).toEqual(['score_vector', 'best_rank', 'TB1', 'TB2']);
  });

  it('Highest individual scores and Best individual rank can be removed and added back', async () => {
    renderEditor();
    await screen.findByLabelText('What is TB1 in this tournament?');
    fireEvent.click(screen.getByLabelText('Remove criterion 2')); // Highest individual scores
    expect(latest?.criteria[0]).toEqual({ kind: 'best_rank' });
    expect(screen.queryAllByText(/Not reached/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Remove criterion 2')); // Best individual rank, now first
    expect(latest?.criteria.some(c => c.kind === 'best_rank')).toBe(false);
    expect(screen.queryAllByText(/Not reached/)).toHaveLength(0);
    const add = screen.getByLabelText('Add a tie-break step') as HTMLSelectElement;
    const labels = Array.from(add.options).map(o => o.textContent);
    expect(labels).toContain('Highest individual scores');
    expect(labels).toContain('Best individual rank');
    expect(labels.some(label => /rank sum/i.test(label ?? ''))).toBe(false);
    fireEvent.change(add, { target: { value: 'best_rank' } });
    expect(latest?.criteria[latest.criteria.length - 1]).toEqual({ kind: 'best_rank' });
  });
});
