import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

let allocator: typeof AllocatorModule;

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

type Player = {
  id: string;
  name: string;
  dob: string | null;
  gender: string | null;
  rating?: number | null;
  rank?: number | null;
};

type YoungestType = 'youngest_female' | 'youngest_male';

const runYoungestAllocation = (categoryType: YoungestType, players: Player[]) => {
  const cat = {
    id: 'cat-1',
    name: 'Youngest',
    is_main: false,
    order_idx: 0,
    category_type: categoryType,
    criteria_json: {},
    prizes: [{ id: 'p1', place: 1, cash_amount: 0, has_trophy: false, has_medal: false, is_active: true }],
  } as any;

  const eligible: Array<{ player: Player; passCodes: string[]; warnCodes: string[] }> = [];
  const failCodes = new Set<string>();

  for (const player of players) {
    const evaluation = allocator.evaluateEligibility(player, cat, defaultRules, new Date('2024-01-01'));
    if (evaluation.eligible) {
      eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
    } else {
      evaluation.reasonCodes.forEach(code => failCodes.add(code));
    }
  }

  if (eligible.length === 0) {
    return { winner: null as Player | null, failCodes: Array.from(failCodes) };
  }

  eligible.sort(allocator.compareYoungestEligible);
  return { winner: eligible[0].player, failCodes: Array.from(failCodes) };
};

describe('youngest category allocation', () => {
  beforeAll(async () => {
    (globalThis as any).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('selects the youngest female by DOB', () => {
    const players: Player[] = [
      { id: 'f1', name: 'Alice', dob: '2012-05-01', gender: 'F', rating: 1200 },
      { id: 'f2', name: 'Beth', dob: '2014-02-01', gender: 'F', rating: 1100 },
      { id: 'm1', name: 'Carl', dob: '2016-03-01', gender: 'M', rating: 1600 },
    ];

    const result = runYoungestAllocation('youngest_female', players);
    expect(result.winner?.id).toBe('f2');
  });

  it('selects the youngest non-female and uses rating for DOB ties', () => {
    const players: Player[] = [
      { id: 'f1', name: 'Dana', dob: '2016-01-01', gender: 'F', rating: 1500 },
      { id: 'm1', name: 'Evan', dob: '2015-01-01', gender: 'M', rating: 1500 },
      { id: 'u1', name: 'Blake', dob: '2015-01-01', gender: null, rating: 1520 },
    ];

    const result = runYoungestAllocation('youngest_male', players);
    expect(result.winner?.id).toBe('u1');
  });

  it('leaves prize unfilled when DOB is missing', () => {
    const players: Player[] = [
      { id: 'f1', name: 'Gina', dob: null, gender: 'F', rating: 1200 },
    ];

    const result = runYoungestAllocation('youngest_female', players);
    expect(result.winner).toBeNull();
    expect(result.failCodes).toContain('dob_missing');
  });
});
