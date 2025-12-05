import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

let allocator: typeof AllocatorModule;

type Prize = {
  id: string;
  place: number;
  cash_amount: number | null;
  has_trophy?: boolean;
  has_medal?: boolean;
  is_active?: boolean;
};

type Category = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  category_type?: string;
  criteria_json?: any;
  prizes: Prize[];
};

describe('Prize Priority Hierarchy', () => {
  beforeAll(async () => {
    (globalThis as any).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  describe('getPrizeTypeScore', () => {
    it('returns 3 for trophy', () => {
      expect(allocator.getPrizeTypeScore({ id: 'p1', place: 1, cash_amount: 0, has_trophy: true })).toBe(3);
    });

    it('returns 2 for medal', () => {
      expect(allocator.getPrizeTypeScore({ id: 'p1', place: 1, cash_amount: 0, has_medal: true })).toBe(2);
    });

    it('returns 0 for neither trophy nor medal', () => {
      expect(allocator.getPrizeTypeScore({ id: 'p1', place: 1, cash_amount: 0 })).toBe(0);
    });

    it('trophy takes precedence when both trophy and medal are true', () => {
      expect(allocator.getPrizeTypeScore({ id: 'p1', place: 1, cash_amount: 0, has_trophy: true, has_medal: true })).toBe(3);
    });
  });

  describe('getPrizeTypeLabel', () => {
    it('returns "trophy" for trophy prizes', () => {
      expect(allocator.getPrizeTypeLabel({ id: 'p1', place: 1, cash_amount: 0, has_trophy: true })).toBe('trophy');
    });

    it('returns "medal" for medal prizes', () => {
      expect(allocator.getPrizeTypeLabel({ id: 'p1', place: 1, cash_amount: 0, has_medal: true })).toBe('medal');
    });

    it('returns "other" for cash-only prizes', () => {
      expect(allocator.getPrizeTypeLabel({ id: 'p1', place: 1, cash_amount: 100 })).toBe('other');
    });
  });

  describe('cmpPrize - Priority Hierarchy', () => {
    const makeEntry = (cat: Partial<Category>, prize: Partial<Prize>) => ({
      cat: {
        id: cat.id ?? 'cat-1',
        name: cat.name ?? 'Test',
        is_main: cat.is_main ?? false,
        order_idx: cat.order_idx ?? 0,
        criteria_json: cat.criteria_json ?? {},
        prizes: []
      } as Category,
      p: {
        id: prize.id ?? 'prize-1',
        place: prize.place ?? 1,
        cash_amount: prize.cash_amount ?? 0,
        has_trophy: prize.has_trophy ?? false,
        has_medal: prize.has_medal ?? false,
        is_active: true
      } as Prize
    });

    it('1. higher cash wins over lower cash', () => {
      const a = makeEntry({}, { cash_amount: 1000 });
      const b = makeEntry({}, { cash_amount: 500 });
      
      expect(allocator.cmpPrize(a, b)).toBeLessThan(0); // a wins
      expect(allocator.cmpPrize(b, a)).toBeGreaterThan(0); // b loses
    });

    it('2. trophy beats medal when cash is equal', () => {
      const trophy = makeEntry({}, { cash_amount: 500, has_trophy: true });
      const medal = makeEntry({}, { cash_amount: 500, has_medal: true });
      
      expect(allocator.cmpPrize(trophy, medal)).toBeLessThan(0); // trophy wins
    });

    it('2. medal beats neither when cash is equal', () => {
      const medal = makeEntry({}, { cash_amount: 500, has_medal: true });
      const nothing = makeEntry({}, { cash_amount: 500 });
      
      expect(allocator.cmpPrize(medal, nothing)).toBeLessThan(0); // medal wins
    });

    it('3. main category beats subcategory when cash and type are equal', () => {
      const main = makeEntry({ is_main: true }, { cash_amount: 500, has_trophy: true });
      const sub = makeEntry({ is_main: false }, { cash_amount: 500, has_trophy: true });
      
      expect(allocator.cmpPrize(main, sub)).toBeLessThan(0); // main wins
    });

    it('4. lower place number wins when cash, type, and main are equal', () => {
      const first = makeEntry({ is_main: true }, { place: 1, cash_amount: 500, has_trophy: true });
      const second = makeEntry({ is_main: true }, { place: 2, cash_amount: 500, has_trophy: true });
      
      expect(allocator.cmpPrize(first, second)).toBeLessThan(0); // 1st wins
    });

    it('5. earlier category order wins when all else is equal', () => {
      const early = makeEntry({ is_main: false, order_idx: 1 }, { place: 1, cash_amount: 500 });
      const late = makeEntry({ is_main: false, order_idx: 5 }, { place: 1, cash_amount: 500 });
      
      expect(allocator.cmpPrize(early, late)).toBeLessThan(0); // earlier wins
    });

    it('6. prize ID is stable tie-breaker', () => {
      const a = makeEntry({ order_idx: 0 }, { id: 'aaa', place: 1, cash_amount: 500 });
      const b = makeEntry({ order_idx: 0 }, { id: 'zzz', place: 1, cash_amount: 500 });
      
      expect(allocator.cmpPrize(a, b)).toBeLessThan(0); // 'aaa' < 'zzz'
    });
  });

  describe('Scenario: Equal-cash trophies in different categories', () => {
    it('player gets 1st place trophy in main over 1st place trophy in subcategory', () => {
      const mainCat: Category = {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'main-1', place: 1, cash_amount: 500, has_trophy: true }]
      };
      
      const subCat: Category = {
        id: 'cat-sub',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1,
        criteria_json: {},
        prizes: [{ id: 'sub-1', place: 1, cash_amount: 500, has_trophy: true }]
      };
      
      const entries = [
        { cat: mainCat, p: mainCat.prizes[0] },
        { cat: subCat, p: subCat.prizes[0] }
      ];
      
      entries.sort(allocator.cmpPrize);
      
      // Main category should come first
      expect(entries[0].cat.name).toBe('Main');
    });

    it('player gets 1st place over 2nd place when both are trophies in subcategories', () => {
      const catA: Category = {
        id: 'cat-a',
        name: 'Category A',
        is_main: false,
        order_idx: 1,
        criteria_json: {},
        prizes: [{ id: 'a-1', place: 1, cash_amount: 500, has_trophy: true }]
      };
      
      const catB: Category = {
        id: 'cat-b',
        name: 'Category B',
        is_main: false,
        order_idx: 0, // Earlier in brochure
        criteria_json: {},
        prizes: [{ id: 'b-2', place: 2, cash_amount: 500, has_trophy: true }]
      };
      
      const entries = [
        { cat: catA, p: catA.prizes[0] },
        { cat: catB, p: catB.prizes[0] }
      ];
      
      entries.sort(allocator.cmpPrize);
      
      // 1st place in Cat A should beat 2nd place in Cat B (place > category order)
      expect(entries[0].p.id).toBe('a-1');
    });
  });

  describe('Scenario: Trophy vs Medal when cash is same', () => {
    it('trophy beats medal at same cash amount', () => {
      const catA: Category = {
        id: 'cat-a',
        name: 'Best Female',
        is_main: false,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'a-1', place: 1, cash_amount: 300, has_medal: true }]
      };
      
      const catB: Category = {
        id: 'cat-b',
        name: 'Under 1400',
        is_main: false,
        order_idx: 1,
        criteria_json: {},
        prizes: [{ id: 'b-1', place: 1, cash_amount: 300, has_trophy: true }]
      };
      
      const entries = [
        { cat: catA, p: catA.prizes[0] },
        { cat: catB, p: catB.prizes[0] }
      ];
      
      entries.sort(allocator.cmpPrize);
      
      // Trophy should beat medal despite later category order
      expect(entries[0].p.id).toBe('b-1');
      expect(entries[0].p.has_trophy).toBe(true);
    });

    it('medal beats nothing at same cash amount', () => {
      const withMedal: Category = {
        id: 'cat-medal',
        name: 'With Medal',
        is_main: false,
        order_idx: 1,
        criteria_json: {},
        prizes: [{ id: 'medal-1', place: 1, cash_amount: 200, has_medal: true }]
      };
      
      const withoutMedal: Category = {
        id: 'cat-cash',
        name: 'Cash Only',
        is_main: false,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'cash-1', place: 1, cash_amount: 200 }]
      };
      
      const entries = [
        { cat: withMedal, p: withMedal.prizes[0] },
        { cat: withoutMedal, p: withoutMedal.prizes[0] }
      ];
      
      entries.sort(allocator.cmpPrize);
      
      // Medal should beat cash-only despite later category order
      expect(entries[0].p.id).toBe('medal-1');
    });
  });

  describe('Full hierarchy test', () => {
    it('sorts a complex mix of prizes correctly', () => {
      const prizes = [
        // Low priority: 2nd place, subcategory, no trophy, low cash
        { cat: { id: 'c1', name: 'Sub A', is_main: false, order_idx: 2, criteria_json: {}, prizes: [] }, 
          p: { id: 'p1', place: 2, cash_amount: 100, has_trophy: false, has_medal: false } },
        // High priority: 1st place, main, trophy, high cash
        { cat: { id: 'c2', name: 'Main', is_main: true, order_idx: 0, criteria_json: {}, prizes: [] }, 
          p: { id: 'p2', place: 1, cash_amount: 1000, has_trophy: true, has_medal: false } },
        // Medium: 1st place, subcategory, medal, medium cash
        { cat: { id: 'c3', name: 'Sub B', is_main: false, order_idx: 1, criteria_json: {}, prizes: [] }, 
          p: { id: 'p3', place: 1, cash_amount: 500, has_trophy: false, has_medal: true } },
        // Medium-high: 2nd place, main, trophy, high cash
        { cat: { id: 'c4', name: 'Main', is_main: true, order_idx: 0, criteria_json: {}, prizes: [] }, 
          p: { id: 'p4', place: 2, cash_amount: 800, has_trophy: true, has_medal: false } },
      ];
      
      prizes.sort((a, b) => allocator.cmpPrize(a as any, b as any));
      
      // Expected order by cash: p2 (1000) > p4 (800) > p3 (500) > p1 (100)
      expect(prizes.map(p => p.p.id)).toEqual(['p2', 'p4', 'p3', 'p1']);
    });
  });
});
