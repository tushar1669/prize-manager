import { describe, expect, it } from 'vitest';

// Test data matching the ceremony script building logic
interface MockWinner {
  prizeId: string;
  place: number;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryOrder: number;
  isMain: boolean;
  playerName: string;
}

interface CeremonyItem {
  type: 'individual' | 'team';
  isMain: boolean;
  categoryOrder: number;
  place: number;
  categoryName: string;
  playerName: string;
}

// Simplified version of buildCeremonyScript for testing
function buildCeremonyScript(winners: MockWinner[]): CeremonyItem[] {
  const items: CeremonyItem[] = [];

  // Group winners by category
  const byCategory = new Map<string, MockWinner[]>();
  winners.forEach(w => {
    if (!byCategory.has(w.categoryId)) {
      byCategory.set(w.categoryId, []);
    }
    byCategory.get(w.categoryId)!.push(w);
  });

  const categoryMeta = new Map<string, { isMain: boolean; order: number }>();
  winners.forEach(w => {
    if (!categoryMeta.has(w.categoryId)) {
      categoryMeta.set(w.categoryId, { isMain: w.isMain, order: w.categoryOrder });
    }
  });

  const categoryIds = Array.from(byCategory.keys());
  const nonMainCategories = categoryIds.filter(id => !categoryMeta.get(id)?.isMain);
  const mainCategories = categoryIds.filter(id => categoryMeta.get(id)?.isMain);

  nonMainCategories.sort((a, b) => (categoryMeta.get(a)?.order ?? 999) - (categoryMeta.get(b)?.order ?? 999));
  mainCategories.sort((a, b) => (categoryMeta.get(a)?.order ?? 999) - (categoryMeta.get(b)?.order ?? 999));

  // Non-main first, place DESC (3rd, 2nd, 1st)
  nonMainCategories.forEach(catId => {
    const catWinners = [...(byCategory.get(catId) || [])];
    catWinners.sort((a, b) => b.place - a.place);
    catWinners.forEach(w => {
      items.push({
        type: 'individual',
        isMain: false,
        categoryOrder: categoryMeta.get(catId)!.order,
        place: w.place,
        categoryName: w.categoryName,
        playerName: w.playerName,
      });
    });
  });

  // Main last, place DESC (Champion = 1st is LAST)
  mainCategories.forEach(catId => {
    const catWinners = [...(byCategory.get(catId) || [])];
    catWinners.sort((a, b) => b.place - a.place);
    catWinners.forEach(w => {
      items.push({
        type: 'individual',
        isMain: true,
        categoryOrder: categoryMeta.get(catId)!.order,
        place: w.place,
        categoryName: w.categoryName,
        playerName: w.playerName,
      });
    });
  });

  return items;
}

describe('Ceremony Script Order', () => {
  it('announces non-main categories before main', () => {
    const winners: MockWinner[] = [
      { prizeId: '1', place: 1, amount: 1000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: 'Champion' },
      { prizeId: '2', place: 1, amount: 500, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'U15 Winner' },
    ];

    const items = buildCeremonyScript(winners);
    
    expect(items.length).toBe(2);
    expect(items[0].categoryName).toBe('Under 15');
    expect(items[1].categoryName).toBe('Main');
  });

  it('announces Champion (1st place main) LAST', () => {
    const winners: MockWinner[] = [
      { prizeId: '1', place: 1, amount: 10000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: 'Champion' },
      { prizeId: '2', place: 2, amount: 7000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: 'Runner-up' },
      { prizeId: '3', place: 3, amount: 5000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: '2nd Runner-up' },
    ];

    const items = buildCeremonyScript(winners);
    
    expect(items.length).toBe(3);
    // Order should be 3rd, 2nd, 1st
    expect(items[0].place).toBe(3);
    expect(items[0].playerName).toBe('2nd Runner-up');
    expect(items[1].place).toBe(2);
    expect(items[1].playerName).toBe('Runner-up');
    expect(items[2].place).toBe(1);
    expect(items[2].playerName).toBe('Champion');
  });

  it('orders categories by brochure order', () => {
    const winners: MockWinner[] = [
      { prizeId: '1', place: 1, amount: 500, categoryId: 'rating', categoryName: 'Rating 1200-1400', categoryOrder: 5, isMain: false, playerName: 'Rating Winner' },
      { prizeId: '2', place: 1, amount: 300, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 2, isMain: false, playerName: 'U15 Winner' },
    ];

    const items = buildCeremonyScript(winners);
    
    expect(items.length).toBe(2);
    // U15 (order 2) should come before Rating (order 5)
    expect(items[0].categoryName).toBe('Under 15');
    expect(items[1].categoryName).toBe('Rating 1200-1400');
  });

  it('orders places within category from lowest to highest (N to 1)', () => {
    const winners: MockWinner[] = [
      { prizeId: '1', place: 1, amount: 500, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'First' },
      { prizeId: '2', place: 2, amount: 300, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'Second' },
      { prizeId: '3', place: 3, amount: 200, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'Third' },
    ];

    const items = buildCeremonyScript(winners);
    
    expect(items.length).toBe(3);
    // Should be 3rd, 2nd, 1st
    expect(items[0].place).toBe(3);
    expect(items[1].place).toBe(2);
    expect(items[2].place).toBe(1);
  });

  it('full ceremony order: non-main categories → main (lowest place → Champion)', () => {
    const winners: MockWinner[] = [
      // Main prizes
      { prizeId: 'm1', place: 1, amount: 10000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: 'Champion' },
      { prizeId: 'm2', place: 2, amount: 7000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: 'Runner-up' },
      { prizeId: 'm3', place: 3, amount: 5000, categoryId: 'main', categoryName: 'Main', categoryOrder: 0, isMain: true, playerName: '2nd Runner-up' },
      // U15 prizes
      { prizeId: 'u1', place: 1, amount: 500, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'U15 First' },
      { prizeId: 'u2', place: 2, amount: 300, categoryId: 'u15', categoryName: 'Under 15', categoryOrder: 1, isMain: false, playerName: 'U15 Second' },
      // Rating prizes
      { prizeId: 'r1', place: 1, amount: 400, categoryId: 'rating', categoryName: 'Rating', categoryOrder: 2, isMain: false, playerName: 'Rating First' },
    ];

    const items = buildCeremonyScript(winners);
    
    expect(items.length).toBe(6);
    
    // Expected order:
    // 1. U15 2nd (non-main, order 1, place 2)
    // 2. U15 1st (non-main, order 1, place 1)
    // 3. Rating 1st (non-main, order 2, place 1)
    // 4. Main 3rd (main, place 3)
    // 5. Main 2nd (main, place 2)
    // 6. Main 1st = Champion (main, place 1) - LAST!
    
    expect(items[0]).toMatchObject({ categoryName: 'Under 15', place: 2, isMain: false });
    expect(items[1]).toMatchObject({ categoryName: 'Under 15', place: 1, isMain: false });
    expect(items[2]).toMatchObject({ categoryName: 'Rating', place: 1, isMain: false });
    expect(items[3]).toMatchObject({ categoryName: 'Main', place: 3, isMain: true });
    expect(items[4]).toMatchObject({ categoryName: 'Main', place: 2, isMain: true });
    expect(items[5]).toMatchObject({ categoryName: 'Main', place: 1, isMain: true, playerName: 'Champion' });
  });
});
