import { describe, expect, it } from 'vitest';
import { groupWinnersByCategory, sortWinnersByAmount, type WinnerRow } from '@/utils/finalizeWinners';

describe('finalize winners ordering', () => {
  it('groups by category order and sorts by place; amount view breaks ties by category then place', () => {
    const rows: WinnerRow[] = [
      {
        winner: { prizeId: 'p1', playerId: 'pl1' },
        prize: {
          id: 'p1',
          place: 2,
          cash_amount: 50,
          category_id: 'main',
          category_name: 'Main',
          category_order: 0,
        },
        player: { id: 'pl1', name: 'Alice' },
      },
      {
        winner: { prizeId: 'p2', playerId: 'pl2' },
        prize: {
          id: 'p2',
          place: 1,
          cash_amount: 100,
          category_id: 'u12',
          category_name: 'U12',
          category_order: 2,
        },
        player: { id: 'pl2', name: 'Ben' },
      },
      {
        winner: { prizeId: 'p3', playerId: 'pl3' },
        prize: {
          id: 'p3',
          place: 1,
          cash_amount: 50,
          category_id: 'main',
          category_name: 'Main',
          category_order: 0,
        },
        player: { id: 'pl3', name: 'Cara' },
      },
      {
        winner: { prizeId: 'p4', playerId: 'pl4' },
        prize: {
          id: 'p4',
          place: 1,
          cash_amount: 50,
          category_id: 'open',
          category_name: 'Open',
          category_order: 1,
        },
        player: { id: 'pl4', name: 'Dee' },
      },
    ];

    const grouped = groupWinnersByCategory(rows);
    expect(grouped.map(group => group.id)).toEqual(['main', 'open', 'u12']);
    expect(grouped[0].winners.map(row => row.prize?.place)).toEqual([1, 2]);

    const sortedByAmount = sortWinnersByAmount(rows);
    expect(sortedByAmount.map(row => row.prize?.id)).toEqual(['p2', 'p3', 'p1', 'p4']);

    expect(rows.map(row => row.prize?.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
