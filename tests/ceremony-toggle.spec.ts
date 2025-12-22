import { describe, expect, it } from 'vitest';
import { sortCeremonyItems, type CeremonyItem } from '@/components/final-prize/ceremonyScriptUtils';

describe('CeremonyScriptView sort toggle', () => {
  const baseItems: CeremonyItem[] = [
    {
      type: 'individual',
      isMain: false,
      categoryOrder: 1,
      place: 2,
      amount: 500,
      categoryName: 'Under 15',
      playerName: 'Player B',
      prizeId: 'p2',
    },
    {
      type: 'individual',
      isMain: false,
      categoryOrder: 1,
      place: 1,
      amount: 1000,
      categoryName: 'Under 15',
      playerName: 'Player A',
      prizeId: 'p1',
    },
    {
      type: 'individual',
      isMain: false,
      categoryOrder: 2,
      place: 1,
      amount: 750,
      categoryName: 'Rating',
      playerName: 'Player C',
      prizeId: 'p3',
    },
  ];

  it('orders by smallest to largest amount when toggle is on', () => {
    const sorted = sortCeremonyItems(baseItems, true);
    expect(sorted.map(item => item.prizeId)).toEqual(['p2', 'p3', 'p1']);
  });

  it('orders by largest to smallest amount when toggle is off', () => {
    const sorted = sortCeremonyItems(baseItems, false);
    expect(sorted.map(item => item.prizeId)).toEqual(['p1', 'p3', 'p2']);
  });
});
