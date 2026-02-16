import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

let allocator: typeof AllocatorModule;

type Prize = {
  id: string;
  place: number;
  cash_amount: number | null;
  has_trophy?: boolean;
  has_medal?: boolean;
  gift_items?: Array<{ name?: string; qty?: number }>;
  is_active?: boolean;
};

type Category = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  category_type?: string;
  criteria_json?: unknown;
  prizes: Prize[];
};

describe('Prize Priority Hierarchy', () => {
  beforeAll(async () => {
    (globalThis as unknown).Deno = {
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
        gift_items: prize.gift_items ?? [],
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

    // NEW: Main-first is now priority 3 when comparing Main vs Side
    it('3. main category wins even with a worse place when comparing Main vs Side', () => {
      const sub1st = makeEntry({ is_main: false }, { place: 1, cash_amount: 500, has_trophy: true });
      const main2nd = makeEntry({ is_main: true }, { place: 2, cash_amount: 500, has_trophy: true });
      
      // Main wins over Side before place is considered
      expect(allocator.cmpPrize(main2nd, sub1st)).toBeLessThan(0); // main wins
    });

    it('4. main category beats subcategory when cash, type, AND place are equal', () => {
      const main = makeEntry({ is_main: true }, { place: 1, cash_amount: 500, has_trophy: true });
      const sub = makeEntry({ is_main: false }, { place: 1, cash_amount: 500, has_trophy: true });
      
      expect(allocator.cmpPrize(main, sub)).toBeLessThan(0); // main wins (same place)
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

  describe('makePrizeComparator default', () => {
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
        gift_items: prize.gift_items ?? [],
        is_active: true
      } as Prize
    });

    it('defaults to main_first when mode is unset', () => {
      const main4th = makeEntry({ is_main: true }, { place: 4, cash_amount: 500, has_trophy: true });
      const side1st = makeEntry({ is_main: false }, { place: 1, cash_amount: 500, has_trophy: true });

      const comparator = allocator.makePrizeComparator();
      const entries = [side1st, main4th];
      entries.sort(comparator);

      expect(entries[0].cat.is_main).toBe(true);
    });
  });

  /**
   * NEW TEST SECTION: "Place before Main" scenarios (place_first mode)
   * 
   * These test the place-first behavior where place number
   * is compared BEFORE main vs subcategory when cash + trophy/medal are equal.
   */
  describe('Place before Main scenarios (place_first mode)', () => {
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
        gift_items: prize.gift_items ?? [],
        is_active: true
      } as Prize
    });

    it('Main 8th vs Rating 1st (equal cash+trophy) → Rating 1st wins (toggle OFF)', () => {
      // This is the "Abhinav scenario" - player should get Rating 1st, not Main 8th
      const main8th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-8', place: 8, cash_amount: 8500, has_trophy: true }
      );
      const rating1st = makeEntry(
        { is_main: false, name: 'Rating 1551-1701' },
        { id: 'rating-1', place: 1, cash_amount: 8500, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [main8th, rating1st];
      entries.sort(comparator);

      // Rating 1st should come first (place 1 < place 8)
      expect(entries[0].p.id).toBe('rating-1');
      expect(entries[0].p.place).toBe(1);
    });

    it('Main 6th vs Rating 7th (equal cash+trophy) → Main 6th wins', () => {
      const main6th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-6', place: 6, cash_amount: 8500, has_trophy: true }
      );
      const rating7th = makeEntry(
        { is_main: false, name: 'Rating 1551-1701' },
        { id: 'rating-7', place: 7, cash_amount: 8500, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [rating7th, main6th];
      entries.sort(comparator);

      // Main 6th should come first (place 6 < place 7)
      expect(entries[0].p.id).toBe('main-6');
      expect(entries[0].p.place).toBe(6);
    });

    it('Main 9th vs Rating 8th (equal cash+trophy) → Rating 8th wins', () => {
      const main9th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-9', place: 9, cash_amount: 8500, has_trophy: true }
      );
      const rating8th = makeEntry(
        { is_main: false, name: 'Rating 1551-1701' },
        { id: 'rating-8', place: 8, cash_amount: 8500, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [main9th, rating8th];
      entries.sort(comparator);

      // Rating 8th should come first (place 8 < place 9)
      expect(entries[0].p.id).toBe('rating-8');
      expect(entries[0].p.place).toBe(8);
    });

    it('When place AND is_main are the same, still falls through correctly', () => {
      // Two 1st place prizes in different subcategories
      const ratingA1st = makeEntry(
        { is_main: false, name: 'Rating Band A', order_idx: 1 },
        { id: 'rating-a-1', place: 1, cash_amount: 5000, has_trophy: true }
      );
      const ratingB1st = makeEntry(
        { is_main: false, name: 'Rating Band B', order_idx: 2 },
        { id: 'rating-b-1', place: 1, cash_amount: 5000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [ratingB1st, ratingA1st];
      entries.sort(comparator);

      // Rating A should come first (lower order_idx = earlier in brochure)
      expect(entries[0].p.id).toBe('rating-a-1');
    });
  });

  /**
   * NEW TEST SECTION: main_vs_side_priority_mode toggle ON
   * 
   * When the toggle is ON, Main prizes beat Side prizes at equal cash/type,
   * BEFORE place is considered. This is useful for tournaments that want
   * Main category prestige to outweigh placement in side categories.
   */
  describe('main_vs_side_priority_mode = main_first (Main-first mode)', () => {
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
        gift_items: prize.gift_items ?? [],
        is_active: true
      } as Prize
    });

    it('Main 4th beats Side 1st when toggle ON (equal cash+trophy)', () => {
      const main4th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 8000, has_trophy: true }
      );
      const side1st = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 8000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entries = [side1st, main4th];
      entries.sort(comparator);

      // Main 4th should come first when toggle is ON
      expect(entries[0].p.id).toBe('main-4');
      expect(entries[0].cat.is_main).toBe(true);
    });

    it('Side 1st still beats Main 4th when toggle OFF (place_first)', () => {
      const main4th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 8000, has_trophy: true }
      );
      const side1st = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 8000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [main4th, side1st];
      entries.sort(comparator);

      // Side 1st should come first when toggle is OFF (place before main)
      expect(entries[0].p.id).toBe('side-1');
      expect(entries[0].p.place).toBe(1);
    });

    it('Side vs Side: 1st still beats 2nd regardless of toggle', () => {
      const sideA1st = makeEntry(
        { is_main: false, name: 'Rating A', order_idx: 1 },
        { id: 'a-1', place: 1, cash_amount: 5000, has_trophy: true }
      );
      const sideB2nd = makeEntry(
        { is_main: false, name: 'Rating B', order_idx: 0 }, // Earlier in brochure
        { id: 'b-2', place: 2, cash_amount: 5000, has_trophy: true }
      );

      // Test with toggle ON
      const comparatorOn = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entriesOn = [sideB2nd, sideA1st];
      entriesOn.sort(comparatorOn);
      
      // 1st place still beats 2nd place (Side vs Side, toggle doesn't apply)
      expect(entriesOn[0].p.id).toBe('a-1');
      expect(entriesOn[0].p.place).toBe(1);

      // Test with toggle OFF
      const comparatorOff = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entriesOff = [sideB2nd, sideA1st];
      entriesOff.sort(comparatorOff);
      
      // 1st place still beats 2nd place
      expect(entriesOff[0].p.id).toBe('a-1');
    });

    it('Main vs Main: lower place still wins regardless of toggle', () => {
      const main2nd = makeEntry(
        { is_main: true, name: 'Main', order_idx: 0 },
        { id: 'main-2', place: 2, cash_amount: 5000, has_trophy: true }
      );
      const main5th = makeEntry(
        { is_main: true, name: 'Main', order_idx: 0 },
        { id: 'main-5', place: 5, cash_amount: 5000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entries = [main5th, main2nd];
      entries.sort(comparator);

      // 2nd place beats 5th place (both Main, so place comparison still applies)
      expect(entries[0].p.id).toBe('main-2');
      expect(entries[0].p.place).toBe(2);
    });

    it('Cash still beats everything regardless of toggle', () => {
      const main4thHighCash = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 10000, has_trophy: true }
      );
      const side1stLowCash = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 5000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entries = [side1stLowCash, main4thHighCash];
      entries.sort(comparator);

      // Higher cash wins regardless
      expect(entries[0].p.id).toBe('main-4');
      expect(entries[0].p.cash_amount).toBe(10000);
    });
  });


  describe('non-cash bundle comparator matrix', () => {
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
        gift_items: prize.gift_items ?? [],
        is_active: true
      } as Prize
    });

    const modes: Array<AllocatorModule.NonCashPriorityMode> = ['TGM', 'TMG', 'GTM', 'GMT', 'MTG', 'MGT'];

    const bundlePrizes = [
      { id: 'none', gift_items: [], has_trophy: false, has_medal: false },
      { id: 't', gift_items: [], has_trophy: true, has_medal: false },
      { id: 'g', gift_items: [{ name: 'Gift', qty: 1 }], has_trophy: false, has_medal: false },
      { id: 'm', gift_items: [], has_trophy: false, has_medal: true },
      { id: 'tg', gift_items: [{ name: 'Gift', qty: 1 }], has_trophy: true, has_medal: false },
      { id: 'tm', gift_items: [], has_trophy: true, has_medal: true },
      { id: 'gm', gift_items: [{ name: 'Gift', qty: 1 }], has_trophy: false, has_medal: true },
      { id: 'tgm', gift_items: [{ name: 'Gift', qty: 1 }], has_trophy: true, has_medal: true },
    ] as const;

    const bit = (prize: (typeof bundlePrizes)[number], c: 'T' | 'G' | 'M') => {
      if (c === 'T') return prize.has_trophy ? 1 : 0;
      if (c === 'G') return prize.gift_items.length > 0 ? 1 : 0;
      return prize.has_medal ? 1 : 0;
    };

    for (const mode of modes) {
      it(`orders all bundle combos for mode ${mode}`, () => {
        const comparator = allocator.makePrizeComparator({
          main_vs_side_priority_mode: 'place_first',
          non_cash_priority_mode: mode,
        });

        const entries = bundlePrizes.map((prize) => makeEntry({ is_main: false }, { ...prize, cash_amount: 500 }));
        entries.sort(comparator);

        const expected = [...bundlePrizes]
          .sort((a, b) => {
            for (const component of mode.split('') as Array<'T' | 'G' | 'M'>) {
              const diff = bit(b, component) - bit(a, component);
              if (diff !== 0) return diff;
            }
            return a.id.localeCompare(b.id);
          })
          .map((prize) => prize.id);

        expect(entries.map((e) => e.p.id)).toEqual(expected);
      });
    }

    it('cash dominance: higher cash always wins even with weaker bundle', () => {
      const comparator = allocator.makePrizeComparator({
        main_vs_side_priority_mode: 'place_first',
        non_cash_priority_mode: 'MGT',
      });

      const highCashNoBundle = makeEntry({}, { id: 'cash-high', cash_amount: 1000, gift_items: [] });
      const lowCashAllBundle = makeEntry({}, { id: 'cash-low', cash_amount: 999, has_trophy: true, has_medal: true, gift_items: [{ name: 'Gift', qty: 1 }] });

      expect(comparator(highCashNoBundle, lowCashAllBundle)).toBeLessThan(0);
    });

    it('tie-breakers remain unchanged after bundle tie', () => {
      const comparator = allocator.makePrizeComparator({
        main_vs_side_priority_mode: 'main_first',
        non_cash_priority_mode: 'TGM',
      });

      const main = makeEntry({ is_main: true, order_idx: 9 }, { id: 'main', cash_amount: 500, has_trophy: true, has_medal: true, gift_items: [{ name: 'Gift', qty: 1 }], place: 2 });
      const side = makeEntry({ is_main: false, order_idx: 0 }, { id: 'side', cash_amount: 500, has_trophy: true, has_medal: true, gift_items: [{ name: 'Gift', qty: 1 }], place: 1 });

      expect(comparator(main, side)).toBeLessThan(0);
    });
  });

  describe('Acceptance cases: main vs side priority modes', () => {
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
        gift_items: prize.gift_items ?? [],
        is_active: true
      } as Prize
    });

    it('Case 1 (place_first): main 4th vs side 1st (equal cash/type) → side 1st wins', () => {
      const main4th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 8000, has_trophy: true }
      );
      const side1st = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 8000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entries = [main4th, side1st];
      entries.sort(comparator);

      expect(entries[0].p.id).toBe('side-1');
    });

    it('Case 2 (main_first): main 4th vs side 1st (equal cash/type) → main 4th wins', () => {
      const main4th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 8000, has_trophy: true }
      );
      const side1st = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 8000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entries = [side1st, main4th];
      entries.sort(comparator);

      expect(entries[0].p.id).toBe('main-4');
    });

    it('Case 3 (side vs side): 1st vs 2nd (equal cash/type) → 1st wins regardless of mode', () => {
      const side1st = makeEntry(
        { is_main: false, name: 'Rating A', order_idx: 1 },
        { id: 'side-1', place: 1, cash_amount: 5000, has_trophy: true }
      );
      const side2nd = makeEntry(
        { is_main: false, name: 'Rating B', order_idx: 0 },
        { id: 'side-2', place: 2, cash_amount: 5000, has_trophy: true }
      );

      const comparatorOn = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entriesOn = [side2nd, side1st];
      entriesOn.sort(comparatorOn);
      expect(entriesOn[0].p.id).toBe('side-1');

      const comparatorOff = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entriesOff = [side2nd, side1st];
      entriesOff.sort(comparatorOff);
      expect(entriesOff[0].p.id).toBe('side-1');
    });

    it('Case 4 (main vs main): 2nd vs 5th (equal cash/type) → 2nd wins regardless of mode', () => {
      const main2nd = makeEntry(
        { is_main: true, name: 'Main', order_idx: 0 },
        { id: 'main-2', place: 2, cash_amount: 5000, has_trophy: true }
      );
      const main5th = makeEntry(
        { is_main: true, name: 'Main', order_idx: 0 },
        { id: 'main-5', place: 5, cash_amount: 5000, has_trophy: true }
      );

      const comparatorOn = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'main_first' });
      const entriesOn = [main5th, main2nd];
      entriesOn.sort(comparatorOn);
      expect(entriesOn[0].p.id).toBe('main-2');

      const comparatorOff = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      const entriesOff = [main5th, main2nd];
      entriesOff.sort(comparatorOff);
      expect(entriesOff[0].p.id).toBe('main-2');
    });

    it('Case 5 (invalid DB value): defaults to main_first behavior', () => {
      const main4th = makeEntry(
        { is_main: true, name: 'Main' },
        { id: 'main-4', place: 4, cash_amount: 8000, has_trophy: true }
      );
      const side1st = makeEntry(
        { is_main: false, name: 'Below-1800' },
        { id: 'side-1', place: 1, cash_amount: 8000, has_trophy: true }
      );

      const comparator = allocator.makePrizeComparator({
        main_vs_side_priority_mode: 'unexpected' as AllocatorModule.MainVsSidePriorityMode
      });
      const entries = [main4th, side1st];
      entries.sort(comparator);

      expect(entries[0].p.id).toBe('main-4');
    });
  });

  describe('Scenario: Equal-cash trophies in different categories', () => {
    it('player gets 1st place in sub over 2nd place in main (place now beats main)', () => {
      const mainCat: Category = {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'main-2', place: 2, cash_amount: 500, has_trophy: true }]
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
      
      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      entries.sort(comparator);
      
      // 1st place in subcategory should beat 2nd place in main (place before main)
      expect(entries[0].cat.name).toBe('Under 1600');
      expect(entries[0].p.place).toBe(1);
    });

    it('player gets 1st place main over 1st place sub (when place is equal, main wins)', () => {
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
        { cat: subCat, p: subCat.prizes[0] },
        { cat: mainCat, p: mainCat.prizes[0] }
      ];
      
      const comparator = allocator.makePrizeComparator({ main_vs_side_priority_mode: 'place_first' });
      entries.sort(comparator);
      
      // When both are 1st place, main should win
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
      
      prizes.sort((a, b) => allocator.cmpPrize(a as unknown, b as unknown));
      
      // Expected order by cash: p2 (1000) > p4 (800) > p3 (500) > p1 (100)
      expect(prizes.map(p => p.p.id)).toEqual(['p2', 'p4', 'p3', 'p1']);
    });
  });
});
