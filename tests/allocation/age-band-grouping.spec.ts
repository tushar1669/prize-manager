import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

vi.mock('npm:@supabase/supabase-js@2', () => ({ createClient: vi.fn(() => ({} as any)) }), { virtual: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tests for age band grouping in non_overlapping mode.
 * 
 * BUG FIXED: When multiple categories share the same max_age (e.g., U8 Boy + U8 Girl),
 * the old code iterated one-by-one, causing the second category to get an invalid band
 * like [9, 8] (effective_min_age > effective_max_age).
 * 
 * FIX: Group categories by max_age first, then derive one band per group.
 */
describe('Age band grouping for Boy/Girl pairs (non_overlapping policy)', () => {
  let allocator: typeof AllocatorModule;

  beforeAll(async () => {
    (globalThis as any).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  const defaultRules = {
    strict_age: true,
    allow_unrated_in_rating: false,
    allow_missing_dob_for_age: false,
    max_age_inclusive: true,
    prefer_category_rank_on_tie: false,
    category_priority_order: ['main', 'others'],
    main_vs_side_priority_mode: 'place_first' as const,
    tie_break_strategy: 'rating_then_name' as const,
    verbose_logs: false,
    age_band_policy: 'non_overlapping' as const,
  };

  // Helper to run allocation with effective age bands
  const runAllocationWithAgeBands = (
    categories: Array<{ id: string; name: string; is_main: boolean; order_idx: number; criteria_json?: any; prizes: any[] }>,
    players: Array<any>,
    rules: any,
    startDate: Date,
  ) => {
    const prizeQueue = categories.flatMap(cat =>
      cat.prizes.map(p => ({ cat: { ...cat, prizes: undefined } as any, p }))
    );
    prizeQueue.sort(allocator.cmpPrize);

    // Compute effective age bands using the same logic as allocatePrizes
    const effectiveAgeBands = new Map<string, { category_id: string; effective_min_age: number; effective_max_age: number }>();
    
    if (rules.age_band_policy === 'non_overlapping') {
      type AgeCatInfo = { id: string; name: string; max_age: number; min_age: number | null };
      
      const ageCats: AgeCatInfo[] = categories
        .filter(c => c.criteria_json?.max_age != null)
        .map(c => ({
          id: c.id,
          name: c.name,
          max_age: Number(c.criteria_json.max_age),
          min_age: c.criteria_json.min_age != null ? Number(c.criteria_json.min_age) : null,
        }));

      // Group by max_age
      const groupsByMaxAge = new Map<number, AgeCatInfo[]>();
      for (const cat of ageCats) {
        const group = groupsByMaxAge.get(cat.max_age) ?? [];
        group.push(cat);
        groupsByMaxAge.set(cat.max_age, group);
      }

      const sortedMaxAges = Array.from(groupsByMaxAge.keys()).sort((a, b) => a - b);

      let prevMaxAge = -1;
      for (const groupMaxAge of sortedMaxAges) {
        const group = groupsByMaxAge.get(groupMaxAge)!;
        const derivedMinAge = prevMaxAge + 1;

        const explicitMins = group
          .map(c => c.min_age)
          .filter((m): m is number => m != null);

        const candidateMin = explicitMins.length > 0
          ? Math.max(derivedMinAge, Math.min(...explicitMins))
          : derivedMinAge;

        const effectiveMin = Math.min(candidateMin, groupMaxAge);

        for (const cat of group) {
          effectiveAgeBands.set(cat.id, {
            category_id: cat.id,
            effective_min_age: effectiveMin,
            effective_max_age: groupMaxAge,
          });
        }

        prevMaxAge = groupMaxAge;
      }
    }

    const assigned = new Set<string>();
    const winners: Array<{ prizeId: string; playerId: string }> = [];
    const unfilled: Array<{ prizeId: string; reasonCodes: string[] }> = [];
    const eligibilityLog: Array<{
      playerId: string;
      categoryId: string;
      eligible: boolean;
      reasonCodes: string[];
    }> = [];

    for (const { cat, p } of prizeQueue) {
      const eligible: Array<{ player: any }> = [];
      const failCodes = new Set<string>();

      for (const player of players) {
        const evaluation = allocator.evaluateEligibility(player, cat as any, rules, startDate, effectiveAgeBands);
        eligibilityLog.push({
          playerId: player.id,
          categoryId: cat.id,
          eligible: evaluation.eligible,
          reasonCodes: evaluation.reasonCodes,
        });
        if (assigned.has(player.id)) continue;
        if (evaluation.eligible) {
          eligible.push({ player });
        } else {
          evaluation.reasonCodes.forEach(code => failCodes.add(code));
        }
      }

      if (eligible.length === 0) {
        unfilled.push({ prizeId: p.id, reasonCodes: Array.from(failCodes).sort() });
        continue;
      }

      eligible.sort((a, b) => allocator.compareEligibleByRankRatingName(a, b, rules.tie_break_strategy));
      const winner = eligible[0];
      assigned.add(winner.player.id);
      winners.push({ prizeId: p.id, playerId: winner.player.id });
    }

    return { winners, unfilled, eligibilityLog, effectiveAgeBands };
  };

  it('Boy/Girl pairs with same max_age get identical effective age bands', () => {
    // Scenario: U8/U11/U14/U17 Boy+Girl pairs
    // All Girls categories should get valid bands (not reversed like [9,8])
    const categories = [
      { id: 'u8-boy', name: 'Under 8 Boy', is_main: false, order_idx: 0, criteria_json: { max_age: 8, gender: 'M' }, prizes: [{ id: 'u8b-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u8-girl', name: 'Under 8 Girl', is_main: false, order_idx: 1, criteria_json: { max_age: 8, gender: 'F' }, prizes: [{ id: 'u8g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11-boy', name: 'Under 11 Boy', is_main: false, order_idx: 2, criteria_json: { max_age: 11, gender: 'M' }, prizes: [{ id: 'u11b-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11-girl', name: 'Under 11 Girl', is_main: false, order_idx: 3, criteria_json: { max_age: 11, gender: 'F' }, prizes: [{ id: 'u11g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u14-boy', name: 'Under 14 Boy', is_main: false, order_idx: 4, criteria_json: { max_age: 14, gender: 'M' }, prizes: [{ id: 'u14b-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u14-girl', name: 'Under 14 Girl', is_main: false, order_idx: 5, criteria_json: { max_age: 14, gender: 'F' }, prizes: [{ id: 'u14g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u17-boy', name: 'Under 17 Boy', is_main: false, order_idx: 6, criteria_json: { max_age: 17, gender: 'M' }, prizes: [{ id: 'u17b-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u17-girl', name: 'Under 17 Girl', is_main: false, order_idx: 7, criteria_json: { max_age: 17, gender: 'F' }, prizes: [{ id: 'u17g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
    ];

    const players: any[] = [];
    const { effectiveAgeBands } = runAllocationWithAgeBands(categories, players, defaultRules, new Date('2024-05-01'));

    // Verify Boy and Girl pairs share identical bands
    expect(effectiveAgeBands.get('u8-boy')).toEqual({ category_id: 'u8-boy', effective_min_age: 0, effective_max_age: 8 });
    expect(effectiveAgeBands.get('u8-girl')).toEqual({ category_id: 'u8-girl', effective_min_age: 0, effective_max_age: 8 });
    
    expect(effectiveAgeBands.get('u11-boy')).toEqual({ category_id: 'u11-boy', effective_min_age: 9, effective_max_age: 11 });
    expect(effectiveAgeBands.get('u11-girl')).toEqual({ category_id: 'u11-girl', effective_min_age: 9, effective_max_age: 11 });
    
    expect(effectiveAgeBands.get('u14-boy')).toEqual({ category_id: 'u14-boy', effective_min_age: 12, effective_max_age: 14 });
    expect(effectiveAgeBands.get('u14-girl')).toEqual({ category_id: 'u14-girl', effective_min_age: 12, effective_max_age: 14 });
    
    expect(effectiveAgeBands.get('u17-boy')).toEqual({ category_id: 'u17-boy', effective_min_age: 15, effective_max_age: 17 });
    expect(effectiveAgeBands.get('u17-girl')).toEqual({ category_id: 'u17-girl', effective_min_age: 15, effective_max_age: 17 });

    // CRITICAL: No band should have effective_min_age > effective_max_age
    for (const [catId, band] of effectiveAgeBands) {
      expect(band.effective_min_age).toBeLessThanOrEqual(band.effective_max_age);
    }
  });

  it('clamps effective_min_age when explicit mins overshoot the band', () => {
    const categories = [
      { id: 'u8-boy', name: 'Under 8 Boy', is_main: false, order_idx: 0, criteria_json: { min_age: 10, max_age: 8, gender: 'M' }, prizes: [{ id: 'u8b-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u8-girl', name: 'Under 8 Girl', is_main: false, order_idx: 1, criteria_json: { min_age: 10, max_age: 8, gender: 'F' }, prizes: [{ id: 'u8g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11', name: 'Under 11', is_main: false, order_idx: 2, criteria_json: { max_age: 11 }, prizes: [{ id: 'u11-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
    ];

    const { effectiveAgeBands } = runAllocationWithAgeBands(categories, [], defaultRules, new Date('2024-05-01'));

    // Explicit min_age=10 should be clamped to the max_age=8 for the U8 pair
    expect(effectiveAgeBands.get('u8-boy')).toEqual({ category_id: 'u8-boy', effective_min_age: 8, effective_max_age: 8 });
    expect(effectiveAgeBands.get('u8-girl')).toEqual({ category_id: 'u8-girl', effective_min_age: 8, effective_max_age: 8 });

    // Downstream band should start after the previous max (non-overlapping)
    expect(effectiveAgeBands.get('u11')).toEqual({ category_id: 'u11', effective_min_age: 9, effective_max_age: 11 });
  });

  it('Girls in each age band are correctly eligible for their category', () => {
    const categories = [
      { id: 'u8-girl', name: 'Under 8 Girl', is_main: false, order_idx: 0, criteria_json: { max_age: 8, gender: 'F' }, prizes: [{ id: 'u8g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11-girl', name: 'Under 11 Girl', is_main: false, order_idx: 1, criteria_json: { max_age: 11, gender: 'F' }, prizes: [{ id: 'u11g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u14-girl', name: 'Under 14 Girl', is_main: false, order_idx: 2, criteria_json: { max_age: 14, gender: 'F' }, prizes: [{ id: 'u14g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u17-girl', name: 'Under 17 Girl', is_main: false, order_idx: 3, criteria_json: { max_age: 17, gender: 'F' }, prizes: [{ id: 'u17g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
    ];

    // Tournament date: 2024-05-01
    const players = [
      { id: 'girl-7', rank: 1, name: 'Girl Age 7', rating: 1000, gender: 'F', dob: '2017-01-15', state: 'DL', unrated: false },  // Age 7
      { id: 'girl-10', rank: 2, name: 'Girl Age 10', rating: 1100, gender: 'F', dob: '2014-03-20', state: 'DL', unrated: false }, // Age 10
      { id: 'girl-13', rank: 3, name: 'Girl Age 13', rating: 1200, gender: 'F', dob: '2011-06-10', state: 'DL', unrated: false }, // Age 13
      { id: 'girl-16', rank: 4, name: 'Girl Age 16', rating: 1300, gender: 'F', dob: '2008-02-25', state: 'DL', unrated: false }, // Age 16
    ];

    const { winners, unfilled, eligibilityLog } = runAllocationWithAgeBands(categories, players, defaultRules, new Date('2024-05-01'));

    // All girls' categories should have winners (none unfilled)
    expect(unfilled.length).toBe(0);
    expect(winners.length).toBe(4);

    // Each girl should win in her correct age band
    expect(winners).toContainEqual({ prizeId: 'u8g-1', playerId: 'girl-7' });
    expect(winners).toContainEqual({ prizeId: 'u11g-1', playerId: 'girl-10' });
    expect(winners).toContainEqual({ prizeId: 'u14g-1', playerId: 'girl-13' });
    expect(winners).toContainEqual({ prizeId: 'u17g-1', playerId: 'girl-16' });

    // No player should fail with BOTH age_below_min and age_above_max (that indicates invalid band)
    for (const log of eligibilityLog) {
      const hasBothAgeFailures = log.reasonCodes.includes('age_below_min') && log.reasonCodes.includes('age_above_max');
      expect(hasBothAgeFailures).toBe(false);
    }
  });

  it('overlapping policy still works: 10yo girl eligible for U11, U14, U17', () => {
    const overlappingRules = { ...defaultRules, age_band_policy: 'overlapping' as const };

    const categories = [
      { id: 'u8-girl', name: 'Under 8 Girl', is_main: false, order_idx: 0, criteria_json: { max_age: 8, gender: 'F' }, prizes: [{ id: 'u8g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11-girl', name: 'Under 11 Girl', is_main: false, order_idx: 1, criteria_json: { max_age: 11, gender: 'F' }, prizes: [{ id: 'u11g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u14-girl', name: 'Under 14 Girl', is_main: false, order_idx: 2, criteria_json: { max_age: 14, gender: 'F' }, prizes: [{ id: 'u14g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u17-girl', name: 'Under 17 Girl', is_main: false, order_idx: 3, criteria_json: { max_age: 17, gender: 'F' }, prizes: [{ id: 'u17g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
    ];

    const players = [
      { id: 'girl-10', rank: 1, name: 'Girl Age 10', rating: 1100, gender: 'F', dob: '2014-03-20', state: 'DL', unrated: false },
    ];

    const { eligibilityLog } = runAllocationWithAgeBands(categories, players, overlappingRules, new Date('2024-05-01'));

    // In overlapping mode, 10yo should be eligible for U11, U14, U17 (but not U8)
    const u8Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u8-girl');
    const u11Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u11-girl');
    const u14Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u14-girl');
    const u17Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u17-girl');

    expect(u8Eligibility?.eligible).toBe(false);  // Too old for U8
    expect(u11Eligibility?.eligible).toBe(true);
    expect(u14Eligibility?.eligible).toBe(true);
    expect(u17Eligibility?.eligible).toBe(true);
  });

  it('non_overlapping policy: 10yo girl eligible ONLY for U11', () => {
    const categories = [
      { id: 'u8-girl', name: 'Under 8 Girl', is_main: false, order_idx: 0, criteria_json: { max_age: 8, gender: 'F' }, prizes: [{ id: 'u8g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u11-girl', name: 'Under 11 Girl', is_main: false, order_idx: 1, criteria_json: { max_age: 11, gender: 'F' }, prizes: [{ id: 'u11g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u14-girl', name: 'Under 14 Girl', is_main: false, order_idx: 2, criteria_json: { max_age: 14, gender: 'F' }, prizes: [{ id: 'u14g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
      { id: 'u17-girl', name: 'Under 17 Girl', is_main: false, order_idx: 3, criteria_json: { max_age: 17, gender: 'F' }, prizes: [{ id: 'u17g-1', place: 1, cash_amount: 500, has_trophy: true, has_medal: false }] },
    ];

    const players = [
      { id: 'girl-10', rank: 1, name: 'Girl Age 10', rating: 1100, gender: 'F', dob: '2014-03-20', state: 'DL', unrated: false },
    ];

    const { eligibilityLog } = runAllocationWithAgeBands(categories, players, defaultRules, new Date('2024-05-01'));

    // In non_overlapping mode, 10yo should ONLY be eligible for U11 (band [9, 11])
    const u8Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u8-girl');
    const u11Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u11-girl');
    const u14Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u14-girl');
    const u17Eligibility = eligibilityLog.find(e => e.playerId === 'girl-10' && e.categoryId === 'u17-girl');

    expect(u8Eligibility?.eligible).toBe(false);   // Band [0, 8], age 10 too old
    expect(u11Eligibility?.eligible).toBe(true);   // Band [9, 11], age 10 fits
    expect(u14Eligibility?.eligible).toBe(false);  // Band [12, 14], age 10 too young
    expect(u17Eligibility?.eligible).toBe(false);  // Band [15, 17], age 10 too young
  });
});
