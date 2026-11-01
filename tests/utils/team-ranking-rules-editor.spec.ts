// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeamRankingRuleConfig } from '@/utils/teamRankingV2';

// The editor reads the latest successful import's detected TB columns.
// Synthetic metadata only: column headings, no player data.
const importState = vi.hoisted(() => ({ headers: null as string[] | null }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({
      data: importState.headers === null ? [] : [{
        file_hash: 'synthetic-file-hash',
        imported_at: '2026-11-01T00:00:00Z',
        meta: {
          import_success: true,
          individual_tb_columns: importState.headers.map((header, i) => (
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
let changes = 0;

function Harness({ initial }: { initial: TeamRankingRuleConfig | null }) {
  const [value, setValue] = useState<TeamRankingRuleConfig | null>(initial);
  return React.createElement(TeamRankingRulesEditor, {
    tournamentId: 'synthetic-tournament',
    open: true,
    value,
    onChange: (next: TeamRankingRuleConfig) => { latest = next; changes += 1; setValue(next); },
  });
}

function renderEditor(initial: TeamRankingRuleConfig | null = null) {
  latest = null;
  changes = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { initial })));
}

const kinds = () => latest?.criteria.map(c => c.kind === 'source_tb' ? `TB${c.ordinal}` : c.kind);
const confirmBox = () => screen.getByRole('checkbox', { name: /ranking order reflects the declared/ }) as HTMLButtonElement;

afterEach(() => { cleanup(); importState.headers = null; });

describe('Team ranking rules — set before the Excel is imported', () => {
  it('a new group starts with the bundled step and can be confirmed with no import at all', async () => {
    renderEditor();
    // Until the import check finishes, the editor does not claim there is no import.
    expect(screen.getByText('Checking the latest import…')).toBeTruthy();
    await screen.findByText(/No Excel imported yet/);
    await vi.waitFor(() => expect(kinds()).toEqual(['score_vector', 'best_rank', 'imported_tbs']));
    expect(screen.getByText('2. Highest individual scores')).toBeTruthy();
    expect(screen.getByText('3. Best individual rank')).toBeTruthy();
    expect(screen.getByText('4. Imported individual tie-breaks')).toBeTruthy();
    expect(screen.getByText(/First TB1 of each team's 1st player \(best rank\), then TB1 of the 2nd player/)).toBeTruthy();
    // Behind Best individual rank it is never reached (ranks are unique).
    expect(screen.getAllByText(/Not reached: Best individual rank above always decides/)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Published team-prize rules reference'), { target: { value: 'Brochure clause 7' } });
    expect(confirmBox().disabled).toBe(false);
    fireEvent.click(confirmBox());
    expect(latest).toEqual({
      version: 2, source_hash: null, published_reference: 'Brochure clause 7', organizer_confirmed: true,
      criteria: [{ kind: 'score_vector' }, { kind: 'best_rank' }, { kind: 'imported_tbs' }],
    });
  });

  it('rules confirmed before the import stay confirmed after it — nothing is added or reset', async () => {
    importState.headers = ['BH:GP/C1', 'BH:GP', 'SB'];
    const savedBeforeImport: TeamRankingRuleConfig = {
      version: 2, source_hash: null, published_reference: 'Brochure clause 7', organizer_confirmed: true,
      criteria: [{ kind: 'score_vector' }, { kind: 'imported_tbs' }, { kind: 'best_rank' }],
    };
    renderEditor(savedBeforeImport);
    await screen.findByText(/From the latest import/);
    expect(changes).toBe(0);
    expect(screen.queryByText(/Imported Excel has changed/)).toBeNull();
    expect(confirmBox().disabled).toBe(false);
    expect(confirmBox().getAttribute('data-state')).toBe('checked');
  });

  it('after an import, lists the columns with their names; a DE column is shown as skipped', async () => {
    importState.headers = ['BH:GP/C1', 'TB2', 'DE', 'SB'];
    renderEditor();
    await screen.findByText(/From the latest import/);
    expect(screen.getByText('TB1 · BH:GP/C1 (Buchholz Cut-1)')).toBeTruthy();
    expect(screen.getByText('TB2 (the file does not say which tie-break)')).toBeTruthy();
    expect(screen.getByText(/TB3 · DE \(Direct Encounter\) — skipped/)).toBeTruthy();
    expect(screen.getByText('TB4 · SB (Sonneborn-Berger)')).toBeTruthy();
    // No per-column steps are added for the file.
    expect(kinds()).toEqual(['score_vector', 'best_rank', 'imported_tbs']);
  });

  it('warns when the latest import has no tie-break columns', async () => {
    importState.headers = [];
    renderEditor();
    await screen.findByText(/The latest import has no tie-break columns/);
  });

  it('the bundled step can be moved above Best individual rank, removed, and added back', async () => {
    renderEditor();
    await screen.findByText(/No Excel imported yet/);
    fireEvent.click(screen.getByLabelText('Move criterion 4 up'));
    expect(kinds()).toEqual(['score_vector', 'imported_tbs', 'best_rank']);
    expect(screen.queryAllByText(/Not reached/)).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Remove criterion 3'));
    expect(kinds()).toEqual(['score_vector', 'best_rank']);
    const add = screen.getByLabelText('Add a tie-break step') as HTMLSelectElement;
    expect(Array.from(add.options).map(o => o.textContent))
      .toContain('Imported individual tie-breaks (TB1, TB2, … from the Excel)');
    fireEvent.change(add, { target: { value: 'imported_tbs' } });
    expect(kinds()).toEqual(['score_vector', 'best_rank', 'imported_tbs']);
  });

  it('Highest individual scores and Best individual rank can be removed and added back; no Rank Sum', async () => {
    importState.headers = ['TB1', 'TB2'];
    renderEditor();
    await screen.findByText(/From the latest import/);
    fireEvent.click(screen.getByLabelText('Remove criterion 2')); // Highest individual scores
    expect(latest?.criteria[0]).toEqual({ kind: 'best_rank' });
    fireEvent.click(screen.getByLabelText('Remove criterion 2')); // Best individual rank, now first
    expect(latest?.criteria.some(c => c.kind === 'best_rank')).toBe(false);
    const add = screen.getByLabelText('Add a tie-break step') as HTMLSelectElement;
    const labels = Array.from(add.options).map(o => o.textContent ?? '');
    expect(labels).toEqual(['Choose a step…', 'Highest individual scores', 'Best individual rank']);
    expect(labels.some(label => /rank sum|TB1|TB2/i.test(label))).toBe(false);
    fireEvent.change(add, { target: { value: 'best_rank' } });
    expect(latest?.criteria[latest.criteria.length - 1]).toEqual({ kind: 'best_rank' });
  });

  it('an older per-column TB step in saved rules is shown and can be removed', async () => {
    importState.headers = ['TB1'];
    renderEditor({
      version: 2, source_hash: 'synthetic-file-hash', published_reference: 'Synthetic brochure', organizer_confirmed: false,
      criteria: [
        { kind: 'score_vector' },
        { kind: 'source_tb', ordinal: 1, name: 'Buchholz Cut-1', aggregation: 'sum', direction: 'higher', verified: true },
      ],
    });
    await screen.findByText('3. Individual TB1 · Buchholz Cut-1 (older step)');
    fireEvent.click(screen.getByLabelText('Remove criterion 3'));
    expect(kinds()).toEqual(['score_vector']);
    expect(latest?.source_hash).toBeNull();
  });
});
