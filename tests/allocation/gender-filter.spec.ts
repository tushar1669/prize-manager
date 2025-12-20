import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

vi.mock('npm:@supabase/supabase-js@2', () => ({ createClient: vi.fn(() => ({} as any)) }), { virtual: true });

/**
 * Tests for unified gender filtering logic.
 * 
 * Gender filter semantics:
 * - 'F' (Girls Only): Requires explicit gender = 'F'. Males and unknowns fail.
 * - 'M' or 'M_OR_UNKNOWN' (Boys / not F): Excludes explicit F. Allows M and null/unknown.
 * - null/empty (Any): No gender restriction.
 * 
 * Backwards compatibility: Old configs with gender='M' behave identically to 'M_OR_UNKNOWN'.
 */
describe('Gender filter eligibility', () => {
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
  };

  const makeCat = (gender: string | null) => ({
    id: 'cat-test',
    name: 'Test Category',
    is_main: false,
    order_idx: 0,
    criteria_json: gender ? { gender } : {},
    prizes: [],
  });

  const makePlayer = (gender: string | null) => ({
    id: 'p1',
    rank: 1,
    name: 'Test Player',
    rating: 1500,
    dob: '2010-01-01',
    state: 'DL',
    unrated: false,
    gender,
  });

  describe('M_OR_UNKNOWN (Boys / not F)', () => {
    const category = makeCat('M_OR_UNKNOWN');

    it('allows male players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('M'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(true);
      expect(result.passCodes).toContain('gender_ok');
    });

    it('allows players with null/unknown gender', () => {
      const result = allocator.evaluateEligibility(
        makePlayer(null),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(true);
      expect(result.passCodes).toContain('gender_ok');
    });

    it('excludes explicit female players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('F'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('gender_mismatch');
    });
  });

  describe('M (legacy Boys Only) - backwards compatibility', () => {
    const category = makeCat('M');

    it('allows male players (same as M_OR_UNKNOWN)', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('M'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(true);
      expect(result.passCodes).toContain('gender_ok');
    });

    it('allows players with null/unknown gender (same as M_OR_UNKNOWN)', () => {
      const result = allocator.evaluateEligibility(
        makePlayer(null),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(true);
      expect(result.passCodes).toContain('gender_ok');
    });

    it('excludes explicit female players (same as M_OR_UNKNOWN)', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('F'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('gender_mismatch');
    });
  });

  describe('F (Girls Only)', () => {
    const category = makeCat('F');

    it('allows explicit female players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('F'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(true);
      expect(result.passCodes).toContain('gender_ok');
    });

    it('excludes male players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('M'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('gender_mismatch');
    });

    it('excludes players with null/unknown gender (gender_missing)', () => {
      const result = allocator.evaluateEligibility(
        makePlayer(null),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain('gender_missing');
    });
  });

  describe('null/empty (Any Gender)', () => {
    const category = makeCat(null);

    it('allows male players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('M'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.passCodes).toContain('gender_open');
    });

    it('allows female players', () => {
      const result = allocator.evaluateEligibility(
        makePlayer('F'),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.passCodes).toContain('gender_open');
    });

    it('allows players with null/unknown gender', () => {
      const result = allocator.evaluateEligibility(
        makePlayer(null),
        category as any,
        defaultRules,
        new Date('2024-05-01')
      );
      expect(result.passCodes).toContain('gender_open');
    });
  });
});
