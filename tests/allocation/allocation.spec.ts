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
});
