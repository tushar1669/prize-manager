import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AllocationCoverageEntry } from '@/types/allocation';
import type { RcaRow } from '@/types/rca';

const downloadWorkbookXlsx = vi.fn<[string, Record<string, unknown[]>], boolean>();
vi.mock('@/utils/excel', () => ({
  downloadWorkbookXlsx: (...args: [string, Record<string, unknown[]>]) =>
    downloadWorkbookXlsx(...args),
}));

import { exportCoverageToXlsx } from '@/utils/allocationCoverageExport';
import { exportRcaToXlsx } from '@/utils/allocationRcaExport';

function makeCoverage(overrides: Partial<AllocationCoverageEntry> = {}): AllocationCoverageEntry {
  return {
    categoryId: 'fixture-open', categoryName: 'Open', prizeId: 'fixture-prize-1',
    place: 1, eligibleCount: 8, pickedCount: 1, reasonCodes: [],
    prize_id: 'fixture-prize-1', category_id: 'fixture-open', category_name: 'Open',
    prize_place: 1, prize_label: 'Open First', prize_type: 'cash', amount: 1000,
    winner_player_id: 'fixture-player-1', winner_rank: 1, winner_rating: 2000,
    winner_name: 'Synthetic Winner One', candidates_before_one_prize: 8,
    candidates_after_one_prize: 8, reason_code: null, reason_details: null,
    is_main: true, is_category: false, is_unfilled: false,
    is_blocked_by_one_prize: false, raw_fail_codes: [],
    diagnosis_summary: null, has_trophy: true, has_medal: false, has_gift: false,
    gift_items: [], ...overrides,
  };
}

function makeRca(overrides: Partial<RcaRow> = {}): RcaRow {
  return {
    tournament_slug: 'fixture-open', tournament_title: 'Synthetic Open',
    category_name: 'Open', is_main: true, prize_place: 1, prize_label: 'Open First',
    prize_type: 'cash', amount: 1000, has_gift: false, gift_items: [],
    engine_winner_player_id: null, engine_winner_name: null,
    engine_winner_rank: null, engine_winner_rating: null,
    final_winner_player_id: null, final_winner_name: null,
    final_winner_rank: null, final_winner_rating: null,
    status: 'NO_ELIGIBLE_WINNER', override_reason: null,
    reason_code: 'NO_ELIGIBLE_PLAYERS', reason_details: null,
    diagnosis_summary: 'No eligible players in this synthetic category',
    raw_fail_codes: ['fixture:gender'], is_unfilled: true,
    is_blocked_by_one_prize: false, ...overrides,
  } as RcaRow;
}

describe('Review diagnostic XLSX contract', () => {
  beforeEach(() => {
    downloadWorkbookXlsx.mockReset();
    downloadWorkbookXlsx.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('Coverage exports both filled and unfilled prizes, preserving their order and business-facing columns', () => {
    const filled = makeCoverage();
    const unfilled = makeCoverage({
      prizeId: 'fixture-prize-2', prize_id: 'fixture-prize-2',
      place: 2, prize_place: 2, prize_label: 'Open Second',
      winner_player_id: null, winner_name: null, winner_rank: null,
      winner_rating: null, is_unfilled: true, reason_code: 'NO_ELIGIBLE_PLAYERS',
      candidates_before_one_prize: 0, candidates_after_one_prize: 0,
      diagnosis_summary: 'No eligible players',
    });
    expect(exportCoverageToXlsx([filled, unfilled], 'fixture-open')).toBe(true);
    expect(downloadWorkbookXlsx).toHaveBeenCalledTimes(1);

    const [filename, sheets] = downloadWorkbookXlsx.mock.calls[0];
    expect(filename).toMatch(/^allocation_coverage_fixture-open_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Object.keys(sheets)).toEqual(['AllocationCoverage']);
    const rows = sheets.AllocationCoverage as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.Status)).toEqual(['Filled', 'Unfilled']);
    expect(rows.map(r => r['Prize Label'])).toEqual(['Open First', 'Open Second']);
    expect(rows[0]['Winner Name']).toBe('Synthetic Winner One');
    expect(rows[1]['Winner Name']).toBe('');
    expect(rows[1].Eligible).toBe(0);
    expect(rows[1].Diagnosis).toBe('No eligible players');
    expect(rows[0]['Has Trophy']).toBe('Yes');
    expect(rows[0]).not.toHaveProperty('Fail Codes');
  });

  it('RCA writes only unfilled prizes with root cause and remediation, without filled winners', () => {
    const filled = makeRca({ is_unfilled: false, status: 'MATCH', prize_label: 'Filled' });
    const unfilled = makeRca();
    expect(exportRcaToXlsx([filled, unfilled], 'fixture-open')).toEqual({ ok: true });
    const [filename, sheets] = downloadWorkbookXlsx.mock.calls[0];
    expect(filename).toMatch(/^allocation_rca_fixture-open_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Object.keys(sheets)).toEqual(['RCA']);
    const rows = sheets.RCA as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]['Prize Label']).toBe('Open First');
    expect(rows[0]['Root Cause']).toContain('No eligible winner');
    expect(rows[0]['Suggested Fix']).toContain('Verify prize criteria');
    expect(rows[0]['Fail Codes']).toBe('fixture:gender');
    expect(rows[0]).not.toHaveProperty('Winner Name');
  });

  it('an all-filled result intentionally produces no RCA workbook', () => {
    expect(exportRcaToXlsx([makeRca({ is_unfilled: false, status: 'MATCH' })], 'fixture-open'))
      .toEqual({ ok: false, reason: 'nothing_unfilled' });
    expect(downloadWorkbookXlsx).not.toHaveBeenCalled();
  });
});
