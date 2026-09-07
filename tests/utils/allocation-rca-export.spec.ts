import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RcaRow } from '@/types/rca';

const downloadWorkbookXlsx = vi.fn<[string, Record<string, unknown[]>], boolean>();

vi.mock('@/utils/excel', () => ({
  downloadWorkbookXlsx: (...args: [string, Record<string, unknown[]>]) =>
    downloadWorkbookXlsx(...args),
}));

import { exportRcaToXlsx } from '@/utils/allocationRcaExport';

function makeRow(overrides: Partial<RcaRow> = {}): RcaRow {
  return {
    tournament_slug: 'jaipur-open',
    tournament_title: 'Jaipur Open',
    category_name: 'Open',
    is_main: true,
    prize_place: 1,
    prize_label: '1st Prize',
    prize_type: 'cash',
    amount: 100000,
    has_gift: false,
    gift_items: [],
    engine_winner_player_id: null,
    engine_winner_name: null,
    engine_winner_rank: null,
    engine_winner_rating: null,
    final_winner_player_id: null,
    final_winner_name: null,
    final_winner_rank: null,
    final_winner_rating: null,
    status: 'NO_ELIGIBLE_WINNER',
    override_reason: null,
    reason_code: null,
    reason_details: null,
    diagnosis_summary: null,
    raw_fail_codes: [],
    is_unfilled: true,
    is_blocked_by_one_prize: false,
    ...overrides,
  } as RcaRow;
}

describe('exportRcaToXlsx result branches', () => {
  beforeEach(() => {
    downloadWorkbookXlsx.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports no_data when there are no RCA rows at all', () => {
    const result = exportRcaToXlsx([], 'jaipur-open');

    expect(result).toEqual({ ok: false, reason: 'no_data' });
    expect(downloadWorkbookXlsx).not.toHaveBeenCalled();
  });

  it('reports nothing_unfilled when every prize has a winner', () => {
    const rows = [
      makeRow({ is_unfilled: false, status: 'MATCH' }),
      makeRow({ prize_place: 2, is_unfilled: false, status: 'MATCH' }),
    ];

    const result = exportRcaToXlsx(rows, 'jaipur-open');

    expect(result).toEqual({ ok: false, reason: 'nothing_unfilled' });
    expect(downloadWorkbookXlsx).not.toHaveBeenCalled();
  });

  it('reports write_failed when the workbook cannot be written', () => {
    downloadWorkbookXlsx.mockReturnValue(false);

    const result = exportRcaToXlsx([makeRow()], 'jaipur-open');

    expect(result).toEqual({ ok: false, reason: 'write_failed' });
    expect(downloadWorkbookXlsx).toHaveBeenCalledTimes(1);
  });

  it('reports ok when unfilled rows are written', () => {
    downloadWorkbookXlsx.mockReturnValue(true);

    const result = exportRcaToXlsx(
      [makeRow(), makeRow({ prize_place: 2, is_unfilled: false, status: 'MATCH' })],
      'jaipur-open',
    );

    expect(result).toEqual({ ok: true });
    expect(downloadWorkbookXlsx).toHaveBeenCalledTimes(1);

    const [filename, sheets] = downloadWorkbookXlsx.mock.calls[0];
    expect(filename).toMatch(/^allocation_rca_.*\.xlsx$/);
    // Only the unfilled row is exported — sheet contents are unchanged.
    expect(sheets.RCA).toHaveLength(1);
  });
});
