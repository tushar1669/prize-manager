import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { defaultRules, runAllocation, type TestCategory, type TestPlayer } from './helpers';

let allocator: typeof AllocatorModule;

type DobSpecialType = 'youngest_male' | 'youngest_female' | 'oldest_male' | 'oldest_female';

const mainCategory = (): TestCategory => ({
  id: 'main',
  name: 'Main Prize',
  is_main: true,
  order_idx: 0,
  criteria_json: {},
  prizes: [{ id: 'main-1', place: 1, cash_amount: 100 }],
});

const dobSpecialCategory = (
  categoryType: DobSpecialType,
  allowDuplicate?: boolean | null,
  prizeCount = 1,
): TestCategory => ({
  id: categoryType,
  name: categoryType,
  is_main: false,
  order_idx: 1,
  category_type: categoryType,
  criteria_json: allowDuplicate === undefined
    ? { category_type: categoryType }
    : { category_type: categoryType, allow_duplicate_winner_for_dob_special: allowDuplicate },
  prizes: Array.from({ length: prizeCount }, (_, index) => ({
    id: `${categoryType}-${index + 1}`,
    place: index + 1,
    cash_amount: 0,
  })),
});

const standardCategory = (): TestCategory => ({
  id: 'standard',
  name: 'Standard',
  is_main: false,
  order_idx: 1,
  criteria_json: { allow_duplicate_winner_for_dob_special: true },
  prizes: [{ id: 'standard-1', place: 1, cash_amount: 0 }],
});

const playersFor = (categoryType: DobSpecialType): TestPlayer[] => {
  const female = categoryType.endsWith('female');
  const oldest = categoryType.startsWith('oldest');
  const trueExtremeDob = oldest ? '1940-01-01' : '2015-01-01';
  const nextExtremeDob = oldest ? '1950-01-01' : '2012-01-01';

  return [
    { id: 'extreme', name: 'True Extreme', dob: trueExtremeDob, gender: female ? 'F' : 'M', rating: 1500, rank: 1 },
    { id: 'next', name: 'Next Eligible', dob: nextExtremeDob, gender: female ? 'F' : 'M', rating: 1400, rank: 2 },
    { id: 'other', name: 'Other Player', dob: oldest ? '1960-01-01' : '2010-01-01', gender: female ? 'F' : 'M', rating: 1300, rank: 3 },
  ];
};

const runMainThenSpecial = (categoryType: DobSpecialType, allowDuplicate?: boolean | null, prizeCount = 1) => {
  const result = runAllocation(
    allocator,
    [mainCategory(), dobSpecialCategory(categoryType, allowDuplicate, prizeCount)],
    playersFor(categoryType),
    defaultRules,
  );

  return result.winners;
};

describe('DOB-special duplicate winner toggle', () => {
  beforeAll(async () => {
    (globalThis as unknown).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('Youngest Boy true youngest already Main winner, toggle OFF -> next youngest boy wins', () => {
    const winners = runMainThenSpecial('youngest_male', false);
    expect(winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('extreme');
    expect(winners.find(w => w.prizeId === 'youngest_male-1')?.playerId).toBe('next');
  });

  it('Youngest Boy true youngest already Main winner, toggle ON -> true youngest also wins Youngest Boy', () => {
    const winners = runMainThenSpecial('youngest_male', true);
    expect(winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('extreme');
    expect(winners.find(w => w.prizeId === 'youngest_male-1')?.playerId).toBe('extreme');
  });

  it('Youngest Girl true youngest already Main winner follows the toggle', () => {
    expect(runMainThenSpecial('youngest_female', false).find(w => w.prizeId === 'youngest_female-1')?.playerId).toBe('next');
    expect(runMainThenSpecial('youngest_female', true).find(w => w.prizeId === 'youngest_female-1')?.playerId).toBe('extreme');
  });

  it('Oldest Man true oldest already Main winner follows the toggle', () => {
    expect(runMainThenSpecial('oldest_male', false).find(w => w.prizeId === 'oldest_male-1')?.playerId).toBe('next');
    expect(runMainThenSpecial('oldest_male', true).find(w => w.prizeId === 'oldest_male-1')?.playerId).toBe('extreme');
  });

  it('Oldest Woman true oldest already Main winner follows the toggle', () => {
    expect(runMainThenSpecial('oldest_female', false).find(w => w.prizeId === 'oldest_female-1')?.playerId).toBe('next');
    expect(runMainThenSpecial('oldest_female', true).find(w => w.prizeId === 'oldest_female-1')?.playerId).toBe('extreme');
  });

  it('prevents the same player from winning two rows inside the same DOB-special category when toggle is ON', () => {
    const winners = runMainThenSpecial('youngest_male', true, 2);
    expect(winners.find(w => w.prizeId === 'youngest_male-1')?.playerId).toBe('extreme');
    expect(winners.find(w => w.prizeId === 'youngest_male-2')?.playerId).toBe('next');
  });

  it('ignores accidental duplicate-winner flag on standard categories', () => {
    const winners = runAllocation(
      allocator,
      [mainCategory(), standardCategory()],
      playersFor('youngest_male'),
      defaultRules,
    ).winners;

    expect(winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('extreme');
    expect(winners.find(w => w.prizeId === 'standard-1')?.playerId).toBe('next');
  });

  it('missing field behaves like OFF', () => {
    const winners = runMainThenSpecial('youngest_male');
    expect(winners.find(w => w.prizeId === 'youngest_male-1')?.playerId).toBe('next');
  });
});
