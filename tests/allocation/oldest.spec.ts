import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { defaultRules, runAllocation, type TestCategory, type TestPlayer } from './helpers';

let allocator: typeof AllocatorModule;

type OldestType = 'oldest_female' | 'oldest_male';

const category = (categoryType: OldestType): TestCategory => ({
  id: `cat-${categoryType}`,
  name: categoryType,
  is_main: false,
  order_idx: 1,
  category_type: categoryType,
  criteria_json: {},
  prizes: [{ id: `p-${categoryType}`, place: 1, cash_amount: 0, is_active: true }],
});

const runOldestAllocation = (categoryType: OldestType, players: TestPlayer[]) => {
  const cat = category(categoryType);
  const eligible: Array<{ player: TestPlayer; passCodes: string[]; warnCodes: string[] }> = [];
  const failCodes = new Set<string>();

  for (const player of players) {
    const evaluation = allocator.evaluateEligibility(player, cat as unknown, defaultRules, new Date('2024-01-01'));
    if (evaluation.eligible) {
      eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
    } else {
      evaluation.reasonCodes.forEach(code => failCodes.add(code));
    }
  }

  if (eligible.length === 0) {
    return { winner: null as TestPlayer | null, failCodes: Array.from(failCodes) };
  }

  eligible.sort(allocator.compareOldestEligible);
  return { winner: eligible[0].player, failCodes: Array.from(failCodes) };
};

describe('oldest category allocation', () => {
  beforeAll(async () => {
    (globalThis as unknown).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('selects the oldest female by earliest DOB', () => {
    const players: TestPlayer[] = [
      { id: 'f1', name: 'Alice', dob: '1960-01-01', gender: 'F', rating: 1200, rank: 2 },
      { id: 'f2', name: 'Beth', dob: '1950-01-01', gender: 'F', rating: 1100, rank: 3 },
      { id: 'm1', name: 'Carl', dob: '1940-01-01', gender: 'M', rating: 1600, rank: 1 },
    ];

    expect(runOldestAllocation('oldest_female', players).winner?.id).toBe('f2');
  });

  it('selects the oldest non-female by earliest DOB', () => {
    const players: TestPlayer[] = [
      { id: 'f1', name: 'Dana', dob: '1930-01-01', gender: 'F', rating: 1500, rank: 1 },
      { id: 'm1', name: 'Evan', dob: '1950-01-01', gender: 'M', rating: 1500, rank: 2 },
      { id: 'u1', name: 'Blake', dob: '1940-01-01', gender: null, rating: 1520, rank: 3 },
    ];

    expect(runOldestAllocation('oldest_male', players).winner?.id).toBe('u1');
  });

  it('excludes male players from oldest_female category', () => {
    const result = runOldestAllocation('oldest_female', [
      { id: 'm1', name: 'Tom', dob: '1940-01-01', gender: 'M', rating: 1500, rank: 1 },
      { id: 'f1', name: 'Sue', dob: '1960-01-01', gender: 'F', rating: 1200, rank: 2 },
    ]);
    expect(result.winner?.id).toBe('f1');
    expect(result.failCodes).toContain('gender_mismatch');
  });

  it('excludes explicit female players from oldest_male category', () => {
    const result = runOldestAllocation('oldest_male', [
      { id: 'f1', name: 'Lisa', dob: '1940-01-01', gender: 'F', rating: 1500, rank: 1 },
      { id: 'm1', name: 'Mark', dob: '1960-01-01', gender: 'M', rating: 1200, rank: 2 },
    ]);
    expect(result.winner?.id).toBe('m1');
    expect(result.failCodes).toContain('gender_mismatch');
  });

  it('allows unknown gender in oldest_male category', () => {
    expect(runOldestAllocation('oldest_male', [
      { id: 'u1', name: 'Pat', dob: '1940-01-01', gender: null, rating: 1300, rank: 1 },
      { id: 'm1', name: 'Joe', dob: '1960-01-01', gender: 'M', rating: 1200, rank: 2 },
    ]).winner?.id).toBe('u1');
  });

  it('excludes missing DOB players and records dob_missing', () => {
    const result = runOldestAllocation('oldest_female', [
      { id: 'f1', name: 'Gina', dob: null, gender: 'F', rating: 1200, rank: 1 },
    ]);
    expect(result.winner).toBeNull();
    expect(result.failCodes).toContain('dob_missing');
  });

  it('uses rank to break same-DOB ties', () => {
    expect(runOldestAllocation('oldest_female', [
      { id: 'f1', name: 'Amy', dob: '1950-03-15', gender: 'F', rating: 1200, rank: 5 },
      { id: 'f2', name: 'Bella', dob: '1950-03-15', gender: 'F', rating: 1100, rank: 3 },
    ]).winner?.id).toBe('f2');
  });

  it('uses rating descending when DOB and rank tie', () => {
    expect(runOldestAllocation('oldest_male', [
      { id: 'm1', name: 'Alex', dob: '1950-07-20', gender: 'M', rating: 1400, rank: 2 },
      { id: 'm2', name: 'Ben', dob: '1950-07-20', gender: 'M', rating: 1600, rank: 2 },
    ]).winner?.id).toBe('m2');
  });

  it('uses name ascending when DOB, rank, and rating tie', () => {
    expect(runOldestAllocation('oldest_female', [
      { id: 'f1', name: 'Zara', dob: '1950-01-01', gender: 'F', rating: 1300, rank: 1 },
      { id: 'f2', name: 'Anna', dob: '1950-01-01', gender: 'F', rating: 1300, rank: 1 },
    ]).winner?.id).toBe('f2');
  });

  it('skips already awarded oldest-eligible players with one-prize-one-player enabled', () => {
    const categories: TestCategory[] = [
      {
        id: 'main',
        name: 'Main Prize',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'main-1', place: 1, cash_amount: 100 }],
      },
      category('oldest_male'),
    ];
    const players: TestPlayer[] = [
      { id: 'm1', name: 'Old Top Rank', dob: '1940-01-01', gender: 'M', rating: 1500, rank: 1 },
      { id: 'm2', name: 'Next Oldest', dob: '1950-01-01', gender: 'M', rating: 1400, rank: 2 },
    ];

    const result = runAllocation(allocator, categories, players, defaultRules);
    expect(result.winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('m1');
    expect(result.winners.find(w => w.prizeId === 'p-oldest_male')?.playerId).toBe('m2');
  });
});
