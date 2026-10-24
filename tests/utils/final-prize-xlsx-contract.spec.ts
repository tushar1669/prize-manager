import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';

const excel = vi.hoisted(() => ({
  downloadWorkbookXlsx: vi.fn(),
  sanitizeFilename: vi.fn((title: string) => title.replace(/[^\w\-.]+/g, '_').slice(0, 80)),
}));

vi.mock('@/utils/excel', () => excel);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FinalPrizeSummaryHeader } from '@/components/final-prize/FinalPrizeSummaryHeader';

const winners: FinalPrizeWinnerRow[] = [
  {
    prizeId: 'fixture-prize-1',
    categoryId: 'fixture-category-main',
    categoryName: 'Main Open',
    categoryOrder: 1,
    isMain: true,
    place: 1,
    playerId: 'synthetic-player-1',
    playerName: 'Synthetic Long Name One 🏆 TROPHY',
    rank: 2,
    amount: 5000,
    hasTrophy: true,
    hasMedal: false,
    hasGift: true,
    giftItems: [{ name: 'Chess Clock', qty: 2 }],
    club: 'Fixture Academy',
    state: 'UP',
  },
  {
    prizeId: 'fixture-prize-2',
    categoryId: 'fixture-category-junior',
    categoryName: 'Under 12',
    categoryOrder: 2,
    isMain: false,
    place: 1,
    playerId: 'synthetic-player-2',
    playerName: 'Synthetic Long Name Two',
    rank: null,
    amount: 0,
    hasTrophy: false,
    hasMedal: true,
    hasGift: false,
    giftItems: [],
    club: null,
    state: null,
  },
];

const totals = { totalPrizes: 2, totalCash: 5000, mainCount: 1, categoryCount: 2 };

function renderHeader(hasFullAccess = true, rows: FinalPrizeWinnerRow[] = winners) {
  return render(createElement(FinalPrizeSummaryHeader, {
    tournamentTitle: 'Synthetic Fixture Open',
    winners: rows,
    totals,
    hasFullAccess,
  }));
}

describe('Final Prize three-sheet XLSX contract (shared final-view header)', () => {
  beforeEach(() => {
    excel.downloadWorkbookXlsx.mockReset();
    excel.downloadWorkbookXlsx.mockReturnValue(true);
  });

  afterEach(() => cleanup());

  it('passes identical, ordered winner rows to Winners and Poster Grid, and adds empty arbiter signatures', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }));

    expect(excel.downloadWorkbookXlsx).toHaveBeenCalledTimes(1);
    const [filename, data] = excel.downloadWorkbookXlsx.mock.calls[0] as [
      string, Record<string, Array<Record<string, string | number>>>
    ];
    expect(filename).toMatch(/^Synthetic_Fixture_Open_final_prizes_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(Object.keys(data)).toEqual(['Winners', 'Poster Grid', 'Arbiter Sheet']);
    expect(data.Winners).toHaveLength(2);
    expect(data['Poster Grid']).toEqual(data.Winners);
    expect(data['Arbiter Sheet']).toHaveLength(2);
    expect(data['Arbiter Sheet'].map(row => {
      const { Signature: _signature, ...winner } = row;
      return winner;
    })).toEqual(data.Winners);
    expect(data['Arbiter Sheet'].every(row => row.Signature === '')).toBe(true);

    expect(Object.keys(data.Winners[0])).toEqual([
      'Category Order', 'Category Name', 'Place', 'Player Name', 'Rank',
      'Amount', 'Trophy', 'Medal', 'Has Gift', 'Gift Items', 'Club/Institution', 'State',
    ]);
    expect(data.Winners.map(row => row['Category Name'])).toEqual(['Main Open', 'Under 12']);
    expect(data.Winners[0]['Player Name']).toBe('Synthetic Long Name One');
    expect(data.Winners[0]['Player Name']).not.toMatch(/TROPHY|🏆/);
    expect(data.Winners[0].Amount).toBe(5000);
    expect(data.Winners[0].Trophy).toBe('Yes');
    expect(data.Winners[0].Medal).toBe('No');
    expect(data.Winners[0]['Has Gift']).toBe('Yes');
    expect(data.Winners[0]['Gift Items']).toBe('Chess Clock ×2');
    expect(data.Winners[1].Rank).toBe('');
    expect(data.Winners[1].Amount).toBe(0);
    expect(data.Winners[1].Medal).toBe('Yes');
    expect(data.Winners[1]['Has Gift']).toBe('No');
  });

  it('keeps full-access entitlement gating on the export control', () => {
    renderHeader(false);
    const button = screen.getByRole('button', { name: 'Export XLSX' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(excel.downloadWorkbookXlsx).not.toHaveBeenCalled();
  });

  it('does not write a workbook if no individual winner rows are available', () => {
    renderHeader(true, []);
    fireEvent.click(screen.getByRole('button', { name: 'Export XLSX' }));
    expect(excel.downloadWorkbookXlsx).not.toHaveBeenCalled();
  });
});
