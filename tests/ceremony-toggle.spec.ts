import { describe, expect, it } from 'vitest';
import { sortCeremonyItems, type CeremonyItem } from '@/components/final-prize/ceremonyScriptUtils';

describe('CeremonyScriptView category-based sort', () => {
  const baseItems: CeremonyItem[] = [
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
      categoryOrder: 1,
      place: 2,
      amount: 500,
      categoryName: 'Under 15',
      playerName: 'Player B',
      prizeId: 'p2',
    },
    {
      type: 'individual',
      isMain: true,
      categoryOrder: 0,
      place: 1,
      amount: 2000,
      categoryName: 'Main',
      playerName: 'Champion',
      prizeId: 'p4',
    },
  ];

  it('orders by category order (non-main first), then place ASC within category', () => {
    const sorted = sortCeremonyItems(baseItems);
    // Non-main categories first (by categoryOrder), then main last
    // Within each category: lowest place first (1st, then 2nd)
    expect(sorted.map(item => item.prizeId)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('places main category last', () => {
    const sorted = sortCeremonyItems(baseItems);
    expect(sorted[sorted.length - 1].isMain).toBe(true);
    expect(sorted[sorted.length - 1].prizeId).toBe('p4');
  });
});
