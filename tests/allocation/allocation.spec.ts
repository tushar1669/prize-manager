import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import './setupAllocatorMocks';
import {
  genderBlankToMF,
  inferUnrated,
  normalizeGrColumn,
  normalizeRating,
  ratingZeroToNull,
  normalizeTypeColumn,
} from '../../src/utils/valueNormalizers';
import { buildSupabasePlayerPayload } from '../../src/utils/playerImportPayload';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadFixture = (fixtureName: string) => {
  const filePath = path.resolve(__dirname, `../fixtures/${fixtureName}.json`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown[];
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
    expect(genderBlankToMF('')).toBeNull();
    expect(genderBlankToMF(null)).toBeNull();
    expect(genderBlankToMF('F')).toBe('F');
    expect(genderBlankToMF('x')).toBeNull();
  });

  it('normalizes Gr column: PC sets disability, all values set group_label', () => {
    // PC detection
    const pcResult = normalizeGrColumn('PC');
    expect(pcResult.disability).toBe('PC');
    expect(pcResult.tags).toContain('PC');
    expect(pcResult.group_label).toBe('PC');

    // PC with surrounding text
    const pcTextResult = normalizeGrColumn('PC-wheelchair');
    expect(pcTextResult.disability).toBe('PC');
    expect(pcTextResult.group_label).toBe('PC-wheelchair');

    // Non-PC values
    const raipurResult = normalizeGrColumn('Raipur');
    expect(raipurResult.disability).toBeNull();
    expect(raipurResult.tags).toEqual([]);
    expect(raipurResult.group_label).toBe('Raipur');

    // Whitespace handling
    const spacedResult = normalizeGrColumn('  Section A  ');
    expect(spacedResult.group_label).toBe('Section A');

    // Empty/null handling
    expect(normalizeGrColumn(null).group_label).toBeNull();
    expect(normalizeGrColumn('').group_label).toBeNull();
    expect(normalizeGrColumn('   ').group_label).toBeNull();
  });

  it('normalizes Type column: trims whitespace, preserves case, returns null for empty', () => {
    // Basic trimming
    expect(normalizeTypeColumn(' S60 ')).toBe('S60');
    expect(normalizeTypeColumn('PC')).toBe('PC');
    expect(normalizeTypeColumn('  F14  ')).toBe('F14');
    
    // Case preservation
    expect(normalizeTypeColumn('pc')).toBe('pc');
    expect(normalizeTypeColumn('Pc')).toBe('Pc');
    
    // Empty/null handling
    expect(normalizeTypeColumn(null)).toBeNull();
    expect(normalizeTypeColumn('')).toBeNull();
    expect(normalizeTypeColumn('   ')).toBeNull();
    expect(normalizeTypeColumn(undefined)).toBeNull();
  });
});

describe('playerImportPayload', () => {
  it('merges state from ident, cleans FIDE id, and tags PC groups', () => {
    const player = {
      ...basePlayers[0],
      state: '',
      rating: normalizeRating(basePlayers[0].rating),
    };

    const payload = buildSupabasePlayerPayload(player as unknown, 'tour-123');

    expect(payload.state).toBe('TN');
    expect(payload.fide_id).toBe('1234567');
    expect(payload.disability).toBe('PC');
    expect((payload.tags_json as unknown).special_group).toContain('PC');
    expect(payload.unrated).toBe(false);
    expect(payload.group_label).toBe('PC'); // PC is preserved as group_label too
  });

  it('populates group_label from Gr column for non-PC values', () => {
    const player = {
      ...basePlayers[0],
      gr: 'Raipur',
      state: 'CG',
      rating: normalizeRating(1500),
    };

    const payload = buildSupabasePlayerPayload(player as unknown, 'tour-456');

    expect(payload.group_label).toBe('Raipur');
    expect(payload.disability).toBeNull(); // Non-PC value shouldn't set disability
  });

  it('handles whitespace and case in Gr column', () => {
    const player = {
      ...basePlayers[0],
      gr: '  SECTION A  ',
      state: 'MH',
      rating: normalizeRating(1400),
    };

    const payload = buildSupabasePlayerPayload(player as unknown, 'tour-789');

    expect(payload.group_label).toBe('SECTION A'); // Trimmed but case preserved
  });
});

describe('allocatePrizes (in-memory synthetic tournaments)', () => {
  let allocator: typeof AllocatorModule;

  beforeAll(async () => {
    (globalThis as unknown).Deno = {
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
    main_vs_side_priority_mode: 'main_first' as const,
    tie_break_strategy: 'rating_then_name' as const,
    verbose_logs: false,
    multi_prize_policy: 'single' as const,
  };

  describe('getAgeOnDate', () => {
    it('computes age using a January 1st cutoff in 2026', () => {
      expect(allocator.getAgeOnDate('2011-01-01', '2026-01-01')).toBe(15);
      expect(allocator.getAgeOnDate('2011-01-02', '2026-01-01')).toBe(14);
    });

    it('computes age using a December 31st cutoff in 2026', () => {
      expect(allocator.getAgeOnDate('2011-12-31', '2026-12-31')).toBe(15);
    });

    it('handles leap-day birthdays around non-leap cutoffs', () => {
      expect(allocator.getAgeOnDate('2012-02-29', '2026-02-28')).toBe(13);
      expect(allocator.getAgeOnDate('2012-02-29', '2026-03-01')).toBe(14);
    });
  });

  describe('resolveAgeCutoffDate', () => {
    const iso = (date: Date) => date.toISOString().slice(0, 10);

    it('defaults to January 1 of the tournament start year', () => {
      const cutoff = allocator.resolveAgeCutoffDate('2026-04-14', undefined, null);
      expect(iso(cutoff)).toBe('2026-01-01');
    });

    it('supports tournament start date policy', () => {
      const cutoff = allocator.resolveAgeCutoffDate('2026-04-14', 'TOURNAMENT_START_DATE', null);
      expect(iso(cutoff)).toBe('2026-04-14');
    });

    it('supports custom date policy', () => {
      const cutoff = allocator.resolveAgeCutoffDate('2026-04-14', 'CUSTOM_DATE', '2025-07-15');
      expect(iso(cutoff)).toBe('2025-07-15');
    });

    it('derives the cutoff year from the tournament start date (no hard-coded year)', () => {
      const cutoff = allocator.resolveAgeCutoffDate('2037-09-02', 'JAN1_TOURNAMENT_YEAR', null);
      expect(iso(cutoff)).toBe('2037-01-01');
    });
  });

  const runAllocation = (
    categories: Array<{ id: string; name: string; is_main: boolean; order_idx: number; criteria_json?: unknown; prizes: unknown[] }>,
    players: Array<unknown>,
    rules: unknown,
    startDate: Date,
  ) => {
    const prizeQueue = categories.flatMap(cat =>
      cat.prizes.map(p => ({ cat: { ...cat, prizes: undefined } as unknown, p }))
    );
    const prizeComparator = allocator.makePrizeComparator({
      main_vs_side_priority_mode: (rules as { main_vs_side_priority_mode?: AllocatorModule.MainVsSidePriorityMode })
        .main_vs_side_priority_mode,
    });
    prizeQueue.sort(prizeComparator);

    const assigned = new Set<string>();
    const winners: Array<{ prizeId: string; playerId: string }> = [];
    const unfilled: Array<{ prizeId: string; reasonCodes: string[] }> = [];
    const eligibilityLog: Array<{
      playerId: string;
      categoryId: string;
      eligible: boolean;
      reasonCodes: string[];
      passCodes: string[];
      warnCodes: string[];
    }> = [];

    for (const { cat, p } of prizeQueue) {
      const eligible: Array<{ player: unknown; passCodes: string[]; warnCodes: string[] }> = [];
      const failCodes = new Set<string>();

      for (const player of players) {
        if (assigned.has(player.id)) continue;
        const evaluation = allocator.evaluateEligibility(player, cat as unknown, rules, startDate);
        eligibilityLog.push({
          playerId: player.id,
          categoryId: cat.id,
          eligible: evaluation.eligible,
          reasonCodes: evaluation.reasonCodes,
          passCodes: evaluation.passCodes,
          warnCodes: evaluation.warnCodes,
        });
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

    return { winners, unfilled, eligibilityLog };
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

  it('prefers main prize when cash amounts are equal and main_vs_side_priority_mode is main_first', () => {
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

    const rulesWithMainPref = { ...defaultRules, main_vs_side_priority_mode: 'main_first' as const };
    const { winners, unfilled } = runAllocation(categories, players, rulesWithMainPref, new Date('2024-05-01'));

    // Alice is eligible for both Main-1 (5000) and U1600-1 (5000)
    // With main_vs_side_priority_mode=main_first, should get Main-1
    expect(winners[0]).toEqual({ prizeId: 'main-1', playerId: 'p1' });
    expect(winners.length).toBe(1);
    expect(unfilled.length).toBe(1);
    expect(unfilled[0].prizeId).toBe('u1600-1');
  });

  it('prefers trophy Top-3 category prize over equal-cash main prize', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Top-3 Trophy', rating: 1700, fide_id: '2001', gender: 'M', dob: '2000-01-01', state: 'MH', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-8', place: 8, cash_amount: 1000, has_trophy: false, has_medal: false },
        ],
      },
      {
        id: 'u1800',
        name: 'Under 1800',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 1800 },
        prizes: [
          { id: 'u1800-3', place: 3, cash_amount: 1000, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    expect(winners).toEqual([{ prizeId: 'u1800-3', playerId: 'p1' }]);
  });

  it('prefers main prize when non-main lacks Top-3 bonus and value is equal', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Main Preference', rating: 1900, fide_id: '3001', gender: 'F', dob: '1995-01-01', state: 'KA', unrated: false },
    ];

    const categories = [
      {
        id: 'main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-15', place: 15, cash_amount: 1000, has_trophy: false, has_medal: false },
        ],
      },
      {
        id: 'u2000',
        name: 'Under 2000',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 2000 },
        prizes: [
          { id: 'u2000-6', place: 15, cash_amount: 1000, has_trophy: false, has_medal: false },
        ],
      },
    ];

    const { winners } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    expect(winners).toEqual([{ prizeId: 'main-15', playerId: 'p1' }]);
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
    const p1Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p1' && e.categoryId === 'unrated');
    expect(p1Eligibility?.reasonCodes).toContain('rated_player_excluded_unrated_only');
    // p2 should explicitly pass via unrated_only_ok
    const p2Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'unrated');
    expect(p2Eligibility?.passCodes).toContain('unrated_only_ok');

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
    const p1Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p1' && e.categoryId === 'veteran-unrated');
    expect(p1Eligibility?.reasonCodes).toContain('rated_player_excluded_unrated_only');

    // p3 should be excluded by age (too young)
    const p3Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p3' && e.categoryId === 'veteran-unrated');
    expect(p3Eligibility?.reasonCodes).toContain('age_below_min');

    // p2 should explicitly show unrated_only_ok pass code
    const p2Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'veteran-unrated');
    expect(p2Eligibility?.passCodes).toContain('unrated_only_ok');

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
    const p2Eligibility = eligibilityLog?.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'u1600-no-unrated');
    expect(p2Eligibility?.reasonCodes).toContain('unrated_excluded');

    expect(unfilled.length).toBe(0);
  });

  it('per-category include_unrated=false blocks unrated even when global allow_unrated_in_rating=true', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'u1600-no-unrated-override',
        name: 'Under 1600 (override no unrated)',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_rating: 1200,
          max_rating: 1600,
          include_unrated: false,
        },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 2000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const rulesAllowUnrated = { ...defaultRules, allow_unrated_in_rating: true };

    const { winners, eligibilityLog } = runAllocation(categories, players, rulesAllowUnrated, new Date('2024-05-01'));

    expect(winners).toEqual([{ prizeId: 'u1600-1', playerId: 'p1' }]);
    const p2Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'u1600-no-unrated-override');
    expect(p2Eligibility?.reasonCodes).toContain('unrated_excluded');
  });

  it('per-category include_unrated=true allows unrated even when global allow_unrated_in_rating=false', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Player', rating: 1500, fide_id: '1001', gender: 'F', dob: '2005-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Player', rating: null, fide_id: null, gender: 'F', dob: '2005-01-01', state: 'MH', unrated: true },
    ];

    const categories = [
      {
        id: 'u1600-allow-unrated',
        name: 'Under 1600 (allow unrated)',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_rating: 1200,
          max_rating: 1600,
          include_unrated: true,
        },
        prizes: [
          { id: 'u1600-1', place: 1, cash_amount: 2000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const rulesBlockUnrated = { ...defaultRules, allow_unrated_in_rating: false };

    const { winners, eligibilityLog } = runAllocation(categories, players, rulesBlockUnrated, new Date('2024-05-01'));

    expect(winners).toEqual([{ prizeId: 'u1600-1', playerId: 'p1' }]);
    const p2Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'u1600-allow-unrated');
    expect(p2Eligibility?.eligible).toBe(true);
    expect(p2Eligibility?.passCodes).toContain('rating_unrated_allowed');
    expect(p2Eligibility?.reasonCodes).not.toContain('unrated_excluded');
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

    const { winners, unfilled, eligibilityLog } = runAllocation(categories, players, rulesNoUnrated, new Date('2024-05-01'));

    // Only p1 (rated, within range) should win
    // p2 should be blocked by legacy logic (min+max band, no global allow)
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    const p2Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'u1600-legacy');
    expect(p2Eligibility?.reasonCodes).toContain('unrated_excluded');
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

    const { winners, unfilled, eligibilityLog } = runAllocation(categories, players, rulesNoUnrated, new Date('2024-05-01'));

    // p1 (rated, within max) wins first prize
    // p2 (unrated) should be ALLOWED by legacy max-only band logic, but prize is taken
    expect(winners.length).toBe(1);
    expect(winners[0]).toEqual({ prizeId: 'u1600-1', playerId: 'p1' });
    const p2Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'u1600-maxonly');
    expect(p2Eligibility?.eligible).toBe(true);
    expect(p2Eligibility?.passCodes).toContain('rating_unrated_allowed');
    expect(unfilled.length).toBe(0);
  });

  it('age-only categories ignore rating for both rated and unrated seniors', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Rated Senior', rating: 1500, fide_id: '1001', gender: 'M', dob: '1950-01-01', state: 'MH', unrated: false },
      { id: 'p2', rank: 2, name: 'Unrated Senior', rating: null, fide_id: null, gender: 'M', dob: '1950-01-01', state: 'MH', unrated: true },
      { id: 'p3', rank: 3, name: 'Young Rated', rating: 1600, fide_id: '1003', gender: 'M', dob: '2010-01-01', state: 'MH', unrated: false },
    ];

    const categories = [
      {
        id: 'veteran',
        name: 'Veteran',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          min_age: 60,
          // no rating bounds and unrated_only is false/undefined
        },
        prizes: [
          { id: 'vet-1', place: 1, cash_amount: 1200, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    expect(winners).toEqual([{ prizeId: 'vet-1', playerId: 'p1' }]);

    const p1Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p1' && e.categoryId === 'veteran');
    const p2Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p2' && e.categoryId === 'veteran');
    const p3Eligibility = eligibilityLog.find((e: unknown) => e.playerId === 'p3' && e.categoryId === 'veteran');

    expect(p1Eligibility?.eligible).toBe(true);
    expect(p2Eligibility?.eligible).toBe(true);
    expect(p1Eligibility?.reasonCodes).not.toContain('unrated_excluded');
    expect(p2Eligibility?.reasonCodes).not.toContain('unrated_excluded');
    expect(p3Eligibility?.reasonCodes).toContain('age_below_min');
  });

  // ============= Group (Gr column) Tests =============

  it('group-only category filters by group_label from Gr column', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Raipur Player 1', rating: 1500, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', unrated: false },
      { id: 'p2', rank: 2, name: 'Durg Player', rating: 1600, gender: 'M', dob: '2000-01-01', group_label: 'Durg', unrated: false },
      { id: 'p3', rank: 3, name: 'Raipur Player 2', rating: 1400, gender: 'M', dob: '2000-01-01', group_label: 'RAIPUR', unrated: false }, // case variation
    ];

    const categories = [
      {
        id: 'best-raipur',
        name: 'Best in Raipur',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_groups: ['Raipur'],
        },
        prizes: [
          { id: 'raipur-1', place: 1, cash_amount: 2000, has_trophy: true, has_medal: false },
          { id: 'raipur-2', place: 2, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // p1 (rank 1, Raipur) wins 1st, p3 (rank 3, RAIPUR - case insensitive) wins 2nd
    // p2 (Durg) is excluded
    expect(winners).toEqual([
      { prizeId: 'raipur-1', playerId: 'p1' },
      { prizeId: 'raipur-2', playerId: 'p3' },
    ]);

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'best-raipur');
    expect(p2Eligibility?.eligible).toBe(false);
    expect(p2Eligibility?.reasonCodes).toContain('group_excluded');

    const p1Eligibility = eligibilityLog.find(e => e.playerId === 'p1' && e.categoryId === 'best-raipur');
    expect(p1Eligibility?.eligible).toBe(true);
    expect(p1Eligibility?.passCodes).toContain('group_ok');
  });

  it('group + age: Best Raipur Senior requires both group and age', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Raipur Senior', rating: 1500, gender: 'M', dob: '1950-01-01', group_label: 'Raipur', unrated: false },
      { id: 'p2', rank: 2, name: 'Raipur Young', rating: 1600, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', unrated: false },
      { id: 'p3', rank: 3, name: 'Durg Senior', rating: 1400, gender: 'M', dob: '1950-01-01', group_label: 'Durg', unrated: false },
    ];

    const categories = [
      {
        id: 'raipur-senior',
        name: 'Best Raipur Senior',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_groups: ['Raipur'],
          min_age: 60,
        },
        prizes: [
          { id: 'rs-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (Raipur + Senior) wins
    expect(winners).toEqual([{ prizeId: 'rs-1', playerId: 'p1' }]);

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'raipur-senior');
    expect(p2Eligibility?.reasonCodes).toContain('age_below_min'); // Fails age

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'raipur-senior');
    expect(p3Eligibility?.reasonCodes).toContain('group_excluded'); // Fails group
  });

  it('group + rating: Best Raipur U1600 requires both group and rating', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Raipur U1600', rating: 1500, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', unrated: false },
      { id: 'p2', rank: 2, name: 'Raipur High Rated', rating: 1800, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', unrated: false },
      { id: 'p3', rank: 3, name: 'Durg U1600', rating: 1400, gender: 'M', dob: '2000-01-01', group_label: 'Durg', unrated: false },
    ];

    const categories = [
      {
        id: 'raipur-u1600',
        name: 'Best Raipur U1600',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_groups: ['Raipur'],
          max_rating: 1600,
        },
        prizes: [
          { id: 'ru-1', place: 1, cash_amount: 1200, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (Raipur + U1600) wins
    expect(winners).toEqual([{ prizeId: 'ru-1', playerId: 'p1' }]);

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'raipur-u1600');
    expect(p2Eligibility?.reasonCodes).toContain('rating_above_max'); // Fails rating

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'raipur-u1600');
    expect(p3Eligibility?.reasonCodes).toContain('group_excluded'); // Fails group
  });

  it('PC in Gr column populates both disability and group_label for dual use', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'PC Player', rating: 1500, gender: 'M', dob: '2000-01-01', group_label: 'PC', disability: 'PC', unrated: false },
      { id: 'p2', rank: 2, name: 'Normal Player', rating: 1600, gender: 'M', dob: '2000-01-01', group_label: null, disability: null, unrated: false },
      { id: 'p3', rank: 3, name: 'PC Group Only', rating: 1490, gender: 'F', dob: '2001-01-01', group_label: 'PC', disability: null, unrated: false },
    ];

    const categories = [
      {
        id: 'pc-disability',
        name: 'PC via Disability',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_disabilities: ['PC'],
        },
        prizes: [
          { id: 'pcd-1', place: 1, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
      {
        id: 'pc-group',
        name: 'PC via Group',
        is_main: false,
        order_idx: 1,
        criteria_json: {
          allowed_groups: ['PC'],
        },
        prizes: [
          { id: 'pcg-1', place: 1, cash_amount: 800, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    expect(winners).toEqual([
      { prizeId: 'pcd-1', playerId: 'p1' },
      { prizeId: 'pcg-1', playerId: 'p3' },
    ]);

    // Verify p1 was eligible for both
    const p1DisabilityEligibility = eligibilityLog.find(e => e.playerId === 'p1' && e.categoryId === 'pc-disability');
    expect(p1DisabilityEligibility?.eligible).toBe(true);

    const p3GroupEligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'pc-group');
    expect(p3GroupEligibility?.eligible).toBe(true);

    // Verify p2 was excluded from both
    const p2DisabilityEligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'pc-disability');
    const p2GroupEligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'pc-group');
    expect(p2DisabilityEligibility?.reasonCodes).toContain('disability_excluded');
    expect(p2GroupEligibility?.reasonCodes).toContain('group_excluded');
  });

  it('handles multiple allowed groups (Section A or Section B)', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Section A', rating: 1500, gender: 'M', dob: '2000-01-01', group_label: 'A', unrated: false },
      { id: 'p2', rank: 2, name: 'Section B', rating: 1600, gender: 'M', dob: '2000-01-01', group_label: 'B', unrated: false },
      { id: 'p3', rank: 3, name: 'Section C', rating: 1400, gender: 'M', dob: '2000-01-01', group_label: 'C', unrated: false },
    ];

    const categories = [
      {
        id: 'sections-ab',
        name: 'Sections A & B',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_groups: ['A', 'B'], // multiple groups allowed
        },
        prizes: [
          { id: 'ab-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: false },
          { id: 'ab-2', place: 2, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // p1 (A) wins 1st, p2 (B) wins 2nd, p3 (C) excluded
    expect(winners).toEqual([
      { prizeId: 'ab-1', playerId: 'p1' },
      { prizeId: 'ab-2', playerId: 'p2' },
    ]);

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'sections-ab');
    expect(p3Eligibility?.reasonCodes).toContain('group_excluded');
  });

  // ============= Type (Type column) Tests =============

  it('type-only category filters by type_label from Type column', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'PC Type Player', rating: 1500, gender: 'M', dob: '2000-01-01', type_label: 'PC', unrated: false },
      { id: 'p2', rank: 2, name: 'S60 Type Player', rating: 1600, gender: 'M', dob: '2000-01-01', type_label: 'S60', unrated: false },
      { id: 'p3', rank: 3, name: 'No Type Player', rating: 1400, gender: 'M', dob: '2000-01-01', type_label: null, unrated: false },
    ];

    const categories = [
      {
        id: 'best-pc-type',
        name: 'Best PC (Type)',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_types: ['PC'],
        },
        prizes: [
          { id: 'pc-type-1', place: 1, cash_amount: 2000, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (Type=PC) wins
    expect(winners).toEqual([{ prizeId: 'pc-type-1', playerId: 'p1' }]);

    const p1Eligibility = eligibilityLog.find(e => e.playerId === 'p1' && e.categoryId === 'best-pc-type');
    expect(p1Eligibility?.eligible).toBe(true);
    expect(p1Eligibility?.passCodes).toContain('type_ok');

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'best-pc-type');
    expect(p2Eligibility?.eligible).toBe(false);
    expect(p2Eligibility?.reasonCodes).toContain('type_excluded');

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'best-pc-type');
    expect(p3Eligibility?.eligible).toBe(false);
    expect(p3Eligibility?.reasonCodes).toContain('type_excluded');
  });

  it('type + age: S60 category requires both Type and age >= 60', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'S60 Senior', rating: 1500, gender: 'M', dob: '1950-01-01', type_label: 'S60', unrated: false },
      { id: 'p2', rank: 2, name: 'S60 Young', rating: 1600, gender: 'M', dob: '2000-01-01', type_label: 'S60', unrated: false },
      { id: 'p3', rank: 3, name: 'U15 Senior', rating: 1400, gender: 'M', dob: '1950-01-01', type_label: 'U15', unrated: false },
    ];

    const categories = [
      {
        id: 's60-senior',
        name: 'Best S60',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_types: ['S60'],
          min_age: 60,
        },
        prizes: [
          { id: 's60-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (S60 + age >= 60) wins
    expect(winners).toEqual([{ prizeId: 's60-1', playerId: 'p1' }]);

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 's60-senior');
    expect(p2Eligibility?.reasonCodes).toContain('age_below_min'); // Fails age

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 's60-senior');
    expect(p3Eligibility?.reasonCodes).toContain('type_excluded'); // Fails type
  });

  it('type + group: PC in Raipur requires both Type and Group', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'Raipur PC', rating: 1500, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', type_label: 'PC', unrated: false },
      { id: 'p2', rank: 2, name: 'Raipur U15', rating: 1600, gender: 'M', dob: '2000-01-01', group_label: 'Raipur', type_label: 'U15', unrated: false },
      { id: 'p3', rank: 3, name: 'Durg PC', rating: 1400, gender: 'M', dob: '2000-01-01', group_label: 'Durg', type_label: 'PC', unrated: false },
    ];

    const categories = [
      {
        id: 'raipur-pc',
        name: 'Best Raipur PC',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_groups: ['Raipur'],
          allowed_types: ['PC'],
        },
        prizes: [
          { id: 'rpc-1', place: 1, cash_amount: 1200, has_trophy: true, has_medal: false },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // Only p1 (Raipur + PC) wins
    expect(winners).toEqual([{ prizeId: 'rpc-1', playerId: 'p1' }]);

    const p1Eligibility = eligibilityLog.find(e => e.playerId === 'p1' && e.categoryId === 'raipur-pc');
    expect(p1Eligibility?.passCodes).toContain('group_ok');
    expect(p1Eligibility?.passCodes).toContain('type_ok');

    const p2Eligibility = eligibilityLog.find(e => e.playerId === 'p2' && e.categoryId === 'raipur-pc');
    expect(p2Eligibility?.reasonCodes).toContain('type_excluded'); // Has Raipur but wrong Type

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'raipur-pc');
    expect(p3Eligibility?.reasonCodes).toContain('group_excluded'); // Has PC but wrong Group
  });

  it('handles multiple allowed types (PC or S60)', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'PC Player', rating: 1500, gender: 'M', dob: '2000-01-01', type_label: 'PC', unrated: false },
      { id: 'p2', rank: 2, name: 'S60 Player', rating: 1600, gender: 'M', dob: '2000-01-01', type_label: 'S60', unrated: false },
      { id: 'p3', rank: 3, name: 'F14 Player', rating: 1400, gender: 'F', dob: '2010-01-01', type_label: 'F14', unrated: false },
    ];

    const categories = [
      {
        id: 'pc-or-s60',
        name: 'PC or S60',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_types: ['PC', 'S60'],
        },
        prizes: [
          { id: 'pcs60-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: false },
          { id: 'pcs60-2', place: 2, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // p1 (PC) wins 1st, p2 (S60) wins 2nd, p3 (F14) excluded
    expect(winners).toEqual([
      { prizeId: 'pcs60-1', playerId: 'p1' },
      { prizeId: 'pcs60-2', playerId: 'p2' },
    ]);

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'pc-or-s60');
    expect(p3Eligibility?.reasonCodes).toContain('type_excluded');
  });

  it('type matching is case-insensitive', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'PC Lower', rating: 1500, gender: 'M', dob: '2000-01-01', type_label: 'pc', unrated: false },
      { id: 'p2', rank: 2, name: 'PC Upper', rating: 1400, gender: 'M', dob: '2000-01-01', type_label: 'PC', unrated: false },
      { id: 'p3', rank: 3, name: 'PC Mixed', rating: 1300, gender: 'M', dob: '2000-01-01', type_label: 'Pc', unrated: false },
    ];

    const categories = [
      {
        id: 'pc-case',
        name: 'PC Case Test',
        is_main: false,
        order_idx: 0,
        criteria_json: {
          allowed_types: ['PC'], // uppercase in criteria
        },
        prizes: [
          { id: 'case-1', place: 1, cash_amount: 1000, has_trophy: false, has_medal: false },
          { id: 'case-2', place: 2, cash_amount: 800, has_trophy: false, has_medal: false },
          { id: 'case-3', place: 3, cash_amount: 600, has_trophy: false, has_medal: false },
        ],
      },
    ];

    const { winners } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // All three should match despite different cases
    expect(winners).toEqual([
      { prizeId: 'case-1', playerId: 'p1' },
      { prizeId: 'case-2', playerId: 'p2' },
      { prizeId: 'case-3', playerId: 'p3' },
    ]);
  });

  // ============= Age (min_age / max_age) Tests =============

  it('max_age criterion filters for Under-X categories (U-13)', () => {
    // Tournament date: 2024-05-01
    // max_age: 13 → player must be <= 13 years old on tournament date
    const players = [
      { id: 'p1', rank: 1, name: 'Young 10yo', rating: 1000, gender: 'M', dob: '2014-06-01', unrated: false }, // ~10 yo
      { id: 'p2', rank: 2, name: 'Edge 13yo', rating: 1100, gender: 'M', dob: '2011-04-30', unrated: false }, // exactly 13
      { id: 'p3', rank: 3, name: 'Old 15yo', rating: 1200, gender: 'M', dob: '2009-01-01', unrated: false }, // ~15 yo
    ];

    const categories = [
      {
        id: 'u13',
        name: 'Under 13',
        is_main: false,
        order_idx: 0,
        criteria_json: { max_age: 13 },
        prizes: [
          { id: 'u13-1', place: 1, cash_amount: 1000, has_trophy: true, has_medal: false },
          { id: 'u13-2', place: 2, cash_amount: 500, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // p1 (10yo) wins 1st, p2 (13yo) wins 2nd, p3 (15yo) excluded
    expect(winners).toEqual([
      { prizeId: 'u13-1', playerId: 'p1' },
      { prizeId: 'u13-2', playerId: 'p2' },
    ]);

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'u13');
    expect(p3Eligibility?.reasonCodes).toContain('age_above_max');
  });

  // ============= State (allowed_states) Tests =============

  it('allowed_states filters by player state', () => {
    const players = [
      { id: 'p1', rank: 1, name: 'MH Player', rating: 1500, gender: 'M', dob: '2000-01-01', state: 'Maharashtra', unrated: false },
      { id: 'p2', rank: 2, name: 'KA Player', rating: 1600, gender: 'M', dob: '2000-01-01', state: 'Karnataka', unrated: false },
      { id: 'p3', rank: 3, name: 'TN Player', rating: 1400, gender: 'M', dob: '2000-01-01', state: 'Tamil Nadu', unrated: false },
    ];

    const categories = [
      {
        id: 'mh-ka-only',
        name: 'Maharashtra/Karnataka Only',
        is_main: false,
        order_idx: 0,
        criteria_json: { allowed_states: ['Maharashtra', 'Karnataka'] },
        prizes: [
          { id: 'state-1', place: 1, cash_amount: 1500, has_trophy: true, has_medal: false },
          { id: 'state-2', place: 2, cash_amount: 1000, has_trophy: false, has_medal: true },
        ],
      },
    ];

    const { winners, eligibilityLog } = runAllocation(categories, players, defaultRules, new Date('2024-05-01'));

    // p1 (MH) wins 1st, p2 (KA) wins 2nd, p3 (TN) excluded
    expect(winners).toEqual([
      { prizeId: 'state-1', playerId: 'p1' },
      { prizeId: 'state-2', playerId: 'p2' },
    ]);

    const p3Eligibility = eligibilityLog.find(e => e.playerId === 'p3' && e.categoryId === 'mh-ka-only');
    expect(p3Eligibility?.reasonCodes).toContain('state_excluded');
  });
});
