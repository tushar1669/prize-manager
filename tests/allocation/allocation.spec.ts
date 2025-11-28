import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  genderBlankToMF,
  inferUnrated,
  normalizeRating,
  ratingZeroToNull,
} from '@/utils/valueNormalizers';
import { buildSupabasePlayerPayload } from '@/utils/playerImportPayload';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadFixture = (fixtureName: string) => {
  const filePath = path.resolve(__dirname, `../fixtures/${fixtureName}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as any[];
};

const basePlayers = loadFixture('base_players');
const duplicatePlayers = loadFixture('duplicates_test');

describe('valueNormalizers', () => {
  it('normalizes zero/blank ratings to null and infers unrated', () => {
    expect(normalizeRating('0')).toBeNull();
    expect(ratingZeroToNull('0')).toBeNull();
    expect(ratingZeroToNull('  ')).toBeNull();

    const inferred = inferUnrated(
      { rating: null, fide_id: null, unrated: undefined },
      {
        treatEmptyAsUnrated: true,
        inferFromMissingRating: true,
      },
    );

    expect(inferred).toBe(true);

    const rated = inferUnrated(
      { rating: 1500, fide_id: null, unrated: 'yes' },
      {
        treatEmptyAsUnrated: true,
        inferFromMissingRating: true,
      },
    );

    expect(rated).toBe(false);
  });

  it('parses gender defaults and leaves invalid blank', () => {
    expect(genderBlankToMF('')).toBe('M');
    expect(genderBlankToMF(null)).toBe('M');
    expect(genderBlankToMF('F')).toBe('F');
    expect(genderBlankToMF('x')).toBeNull();
  });
});

describe('playerImportPayload', () => {
  it('merges state from ident, cleans FIDE id, and tags PC groups', () => {
    const player = {
      ...basePlayers[0],
      state: '',
      rating: normalizeRating(basePlayers[0].rating),
    };

    const payload = buildSupabasePlayerPayload(player as any, 'tour-123');

    expect(payload.state).toBe('TN');
    expect(payload.fide_id).toBe('1234567');
    expect(payload.disability).toBe('PC');
    expect((payload.tags_json as any).special_group).toContain('PC');
    expect(payload.unrated).toBe(false);
  });
});

describe('allocatePrizes (in-memory synthetic tournaments)', () => {
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
    prefer_main_on_equal_value: true,
    category_priority_order: ['main', 'others'],
    tie_break_strategy: 'rating_then_name' as const,
    verbose_logs: false,
  };

  const runAllocation = (
    categories: Array<{ id: string; name: string; is_main: boolean; order_idx: number; criteria_json?: any; prizes: any[] }>,
    players: Array<any>,
    rules: any,
    startDate: Date,
  ) => {
    const prizeQueue = categories.flatMap(cat =>
      cat.prizes.map(p => ({ cat: { ...cat, prizes: undefined } as any, p }))
    );
    prizeQueue.sort(allocator.cmpPrize);

    const assigned = new Set<string>();
    const winners: Array<{ prizeId: string; playerId: string }> = [];
    const unfilled: Array<{ prizeId: string; reasonCodes: string[] }> = [];

    for (const { cat, p } of prizeQueue) {
      const eligible: Array<{ player: any; passCodes: string[]; warnCodes: string[] }> = [];
      const failCodes = new Set<string>();

      for (const player of players) {
        if (assigned.has(player.id)) continue;
        const evaluation = allocator.evaluateEligibility(player, cat as any, rules, startDate);
        if (evaluation.eligible) {
          eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
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

    return { winners, unfilled };
  };

  it('respects age, gender, and location filters while picking top ranks', () => {
    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 5000, has_trophy: true, has_medal: false },
        ],
      },
      {
        id: 'women',
        name: 'Women',
        is_main: false,
        order_idx: 1,
        criteria_json: { gender: 'F' },
        prizes: [
          { id: 'women-1', place: 1, cash_amount: 2000, has_trophy: true, has_medal: false },
        ],
      },
      {
        id: 'u14',
        name: 'Under 14',
        is_main: false,
        order_idx: 2,
        criteria_json: { max_age: 14 },
        prizes: [
          { id: 'u14-1', place: 1, cash_amount: 1000, has_trophy: true, has_medal: false },
        ],
      },
      {
        id: 'mh',
        name: 'Maharashtra',
        is_main: false,
        order_idx: 3,
        criteria_json: { allowed_states: ['Maharashtra'], state_aliases: { Maharashtra: ['MH'] } },
        prizes: [
          { id: 'mh-1', place: 1, cash_amount: 750, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, unfilled } = runAllocation(categories, basePlayers, defaultRules, new Date('2024-05-01'));

    expect(winners).toEqual([
      { prizeId: 'main-1', playerId: 'p1' },
      { prizeId: 'women-1', playerId: 'p2' },
      { prizeId: 'u14-1', playerId: 'p3' },
      { prizeId: 'mh-1', playerId: 'p5' },
    ]);

    const u14Unfilled = unfilled.find(entry => entry.prizeId === 'u14-1');
    const mhUnfilled = unfilled.find(entry => entry.prizeId === 'mh-1');

    expect(u14Unfilled).toBeUndefined();
    expect(mhUnfilled).toBeUndefined();
  });

  it('allows unrated players in max-rating categories and breaks rank ties by rating then name', () => {
    const players = [
      ...duplicatePlayers,
      { id: 'd4', rank: 3, name: 'Unrated Hopeful', rating: null, fide_id: null, gender: 'F', dob: '2011-06-06', state: 'MH', unrated: true },
      { id: 'd5', rank: 4, name: 'Over Max Rated', rating: 1750, fide_id: '99100', gender: 'M', dob: '2010-06-06', state: 'MH', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 500, has_trophy: false, has_medal: false },
        ],
      },
      {
        id: 'u1600',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 1600 },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 250, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, unfilled } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    expect(winners[0]).toEqual({ prizeId: 'main-1', playerId: 'd1' });
    expect(winners[1]).toEqual({ prizeId: 'u1600-1', playerId: 'd4' });
    expect(unfilled.length).toBe(0);
  });

  it('implements max-cash-per-player: player gets higher-value category prize over lower main prize', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Alice', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Bob', rating: 1800, fide_id: '1002', gender: 'M', dob: '2005-02-01', state: 'MH', unrated: false },
      { id: 'p3', rank: 3, name: 'Charlie', rating: 1400, fide_id: '1003', gender: 'M', dob: '2005-03-01', state: 'DL', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 5000, has_trophy: true, has_medal: false },
          { id: 'main-2', place: 2, cash_amount: 3000, has_trophy: false, has_medal: true },
        ],
      },
      {
        id: 'u1600',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 1600 },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 7000, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, unfilled } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Alice (rank 1, rating 1500) is eligible for Main-1 (5000) and U1600-1 (7000)
    // Should get U1600-1 (7000) due to max-cash-per-player
    expect(winners.find(w => w.playerId === 'p1')).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    
    // Bob (rank 2, rating 1800) is only eligible for Main (not U1600)
    // Should get Main-1 (5000)
    expect(winners.find(w => w.playerId === 'p2')).toEqual({ prizeId: 'main-1', playerId: 'p2' });
    
    // Charlie (rank 3, rating 1400) is eligible for Main-2 (3000) and U1600, but U1600-1 already taken
    // Should get Main-2 (3000)
    expect(winners.find(w => w.playerId === 'p3')).toEqual({ prizeId: 'main-2', playerId: 'p3' });

    expect(winners.length).toBe(3);
    expect(unfilled.length).toBe(0);
  });

  it('prefers main prize when cash amounts are equal and prefer_main_on_equal_value is true', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Alice', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 5000, has_trophy: true, has_medal: false },
        ],
      },
      {
        id: 'u1600',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 1600 },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 5000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const rulesWithMainPref = { ...defaultRules, prefer_main_on_equal_value: true };
    const { winners, unfilled } = runAllocation(categories, players, rulesWithMainPref, new Date('2024-05-01'));

    // Alice is eligible for both Main-1 (5000) and U1600-1 (5000)
    // With prefer_main_on_equal_value=true, should get Main-1
    expect(winners[0]).toEqual({ prizeId: 'main-1', playerId: 'p1' });
    expect(winners.length).toBe(1);
    expect(unfilled.length).toBe(1);
    expect(unfilled[0].prizeId).toBe('u1600-1');
  });

  it('allocates rating prize when higher cash than main, even if main comes first in brochure order', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Alice', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Bob', rating: 1400, fide_id: '1002', gender: 'M', dob: '2005-02-01', state: 'MH', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0, // Listed first in brochure
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 3000, has_trophy: true, has_medal: false },
        ],
      },
      {
        id: 'u1600',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1, // Listed second in brochure
        criteria_json: { max_rating: 1600 },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 8000, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, unfilled } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Despite Main being listed first (order_idx=0), U1600 has higher cash (8000 vs 3000)
    // Alice should get U1600-1 (8000)
    expect(winners.find(w => w.playerId === 'p1')).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    
    // Bob should get Main-1 (3000)
    expect(winners.find(w => w.playerId === 'p2')).toEqual({ prizeId: 'main-1', playerId: 'p2' });

    expect(winners.length).toBe(2);
    expect(unfilled.length).toBe(0);
  });

  it('unrated-only category excludes rated players and accepts only unrated players', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'unrated',
        name: 'Unrated',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          unrated_only: true,
          // no min_rating, no max_rating
        },
        prizes: [
          { id: 'unrated-1', place: 1, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, unfilled, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p2 (unrated) should win
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'unrated-1', playerId: 'p2' });

    // p1 should be rejected with rated_player_excluded_unrated_only
    const p1Eligibility = eligibilityLog?.find((e: any) => e.playerId === 'p1' && e.categoryId === 'unrated');
    expect(p1Eligibility?.reasonCodes).toContain('rated_player_excluded_unrated_only');

    expect(unfilled.length).toBe(0);
  });

  it('veteran + unrated-only category requires both age and unrated status', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Senior', rating: 1600, fide_id: '1001', gender: 'M', dob: '1950-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Senior', rating: null, fide_id: null, gender: 'M', dob: '1950-01-01', state: 'MH', unrated: true },
      { id: 'p3', rank: 3, name: 'Unrated Young', rating: null, fide_id: null, gender: 'M', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'veteran-unrated',
        name: 'Veteran Unrated',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_age: 60,
          unrated_only: true,
        },
        prizes: [
          { id: 'vet-unrated-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: true },
        ],
      },
    ];

    const { winners, unfilled, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p2 (unrated + age >= 60) should win
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'vet-unrated-1', playerId: 'p2' });

    // p1 should be excluded because rated (even though age passes)
    const p1Eligibility = eligibilityLog?.find((e: any) => e.playerId === 'p1' && e.categoryId === 'veteran-unrated');
    expect(p1Eligibility?.reasonCodes).toContain('rated_player_excluded_unrated_only');

    // p3 should be excluded by age (too young)
    const p3Eligibility = eligibilityLog?.find((e: any) => e.playerId === 'p3' && e.categoryId === 'veteran-unrated');
    expect(p3Eligibility?.reasonCodes).toContain('age_below_min');

    expect(unfilled.length).toBe(0);
  });

  it('regression: rating category with include_unrated=false still works after unrated_only addition', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'u1600-no-unrated',
        name: 'Under 1600 (no unrated)',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_rating: 1200,
          max_rating: 1600,
          include_unrated: false,
          // unrated_only NOT set (undefined)
        },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 2000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, unfilled, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (rated, within range) should win
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });

    // p2 should be excluded because unrated and include_unrated=false
    const p2Eligibility = eligibilityLog?.find((e: any) => e.playerId === 'p2' && e.categoryId === 'u1600-no-unrated');
    expect(p2Eligibility?.reasonCodes).toContain('unrated_excluded');

    expect(unfilled.length).toBe(0);
  });

  it('uses legacy fallback when include_unrated is unset: unrated blocked when global rule is false and band has min+max', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'u1600-legacy',
        name: 'Under 1600 legacy',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_rating: 1200,
          max_rating: 1600,
          // include_unrated is deliberately UNSET here to test legacy fallback
        },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 2000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const rulesNoUnrated = { ...defaultRules, allow_unrated_in_rating: false };

    const { winners, unfilled } = runAllocation(categories, players, rulesNoUnrated, new Date('2024-05-01'));

    // Only p1 (rated, within range) should win
    // p2 should be blocked by legacy logic (min+max band, no global allow)
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    expect(unfilled.length).toBe(0);
  });

  it('uses legacy fallback: max-only band allows unrated when include_unrated is unset', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'u1600-maxonly',
        name: 'Under 1600 max-only',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          max_rating: 1600,
          // NO min_rating - this is a "max-only" band
          // include_unrated is deliberately UNSET here
        },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 2000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const rulesNoUnrated = { ...defaultRules, allow_unrated_in_rating: false };

    const { winners, unfilled } = runAllocation(categories, players, rulesNoUnrated, new Date('2024-05-01'));

    // p1 (rated, within max) wins first prize
    // p2 (unrated) should be ALLOWED by legacy max-only band logic, but prize is taken
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    expect(unfilled.length).toBe(0);
  });
});
