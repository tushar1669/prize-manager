import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';

vi.mock('@/hooks/useFinalPrizeData', () => ({
  useFinalPrizeData: () => ({ data: null, isLoading: false }),
}));

import { ArbiterSheetView } from '@/components/final-prize/ArbiterSheetView';

const fixtures: FinalPrizeWinnerRow[] = [
  {
    prizeId: 'synthetic-prize-1', playerId: 'synthetic-player-1',
    categoryId: 'synthetic-main', categoryName: 'Main Open',
    categoryOrder: 0, isMain: true, place: 1, rank: 1,
    playerName: 'Synthetic Winner One With A Long Name',
    amount: 15000, hasTrophy: true, hasMedal: true,
    hasGift: true, giftItems: [{ name: 'Synthetic Chess Clock', qty: 2 }],
    club: 'Fixture Academy', state: 'UP',
  },
  {
    prizeId: 'synthetic-prize-2', playerId: 'synthetic-player-2',
    categoryId: 'synthetic-junior', categoryName: 'Under 12 Girls',
    categoryOrder: 1, isMain: false, place: 2, rank: null,
    playerName: 'Synthetic Winner Two', amount: 3421,
    hasTrophy: false, hasMedal: true,
    hasGift: false, giftItems: [], club: null, state: null,
  },
  {
    prizeId: 'synthetic-prize-3', playerId: 'synthetic-player-3',
    categoryId: 'synthetic-open', categoryName: 'Under 16 Open',
    categoryOrder: 2, isMain: false, place: 3, rank: 18,
    playerName: 'Synthetic Winner Three', amount: 3863,
    hasTrophy: false, hasMedal: false,
    hasGift: false, giftItems: [], club: null, state: null,
  },
];

afterEach(cleanup);

describe('Arbiter Sheet presentation-only visual refresh', () => {
  it('retains every existing table column, winner row and signature box', () => {
    const { container } = render(createElement(ArbiterSheetView, { winners: fixtures, hasFullAccess: true }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header plus 3 original award rows
    expect(within(rows[0]).getAllByRole('columnheader').map(h => h.textContent)).toEqual([
      'Place', 'Category', 'Player', 'Rank', 'Amount', 'Gift', 'Trophy', 'Medal', 'Sign',
    ]);
    for (const [index, fixture] of fixtures.entries()) {
      const row = rows[index + 1];
      expect(row.textContent).toContain(fixture.playerName);
      expect(row.textContent).toContain(fixture.categoryName);
      expect(within(row).getAllByRole('cell')).toHaveLength(9);
    }
    expect(screen.getByText('₹15,000')).toBeTruthy();
    expect(screen.getByText('₹3,421')).toBeTruthy();
    expect(screen.getByText('Synthetic Chess Clock ×2')).toBeTruthy();
    expect(container.querySelectorAll('.pm-arbiter-sign-box')).toHaveLength(fixtures.length);
    expect(rows[1].classList.contains('pm-arbiter-row--main')).toBe(true);
    expect(rows[2].classList.contains('pm-arbiter-row--teal')).toBe(true);
    expect(rows[3].classList.contains('pm-arbiter-row--navy')).toBe(true);
    for (const row of rows.slice(1)) {
      expect(row.classList.contains('pm-arbiter-row--section-start')).toBe(true);
      expect(row.classList.contains('pm-arbiter-row--section-end')).toBe(true);
    }
    expect(container.querySelector('.pm-arbiter-titlegroup')).toBeTruthy();
    expect(container.querySelectorAll('.pm-arbiter-rank')).toHaveLength(fixtures.length);
    expect(container.querySelector('.pm-arbiter-table')).toBeTruthy();
  });

  it('does not reveal any winner when full tournament access is unavailable', () => {
    const { container } = render(createElement(ArbiterSheetView, { winners: fixtures, hasFullAccess: false }));
    expect(screen.getByText('Arbiter Sheet — Pro Only')).toBeTruthy();
    expect(container.querySelector('.pm-arbiter-table')).toBeNull();
    for (const fixture of fixtures) {
      expect(screen.queryByText(fixture.playerName)).toBeNull();
    }
  });

  it('keeps all eight original columns when no winner has a gift', () => {
    render(createElement(ArbiterSheetView, {
      winners: fixtures.map(winner => ({ ...winner, giftItems: [], hasGift: false })),
      hasFullAccess: true,
    }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.queryByRole('columnheader', { name: 'Gift' })).toBeNull();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});
