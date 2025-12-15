import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { defaultRules, runAllocation } from './helpers';

let allocator: typeof AllocatorModule;

describe('multi_prize_policy', () => {
  beforeAll(async () => {
    (globalThis as any).Deno = { serve: vi.fn(), env: { get: vi.fn() } };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('keeps legacy one-prize-per-player behaviour when policy=single', () => {
    const categories = [
      { id: 'main', name: 'Main', is_main: true, order_idx: 0, prizes: [{ id: 'm1', place: 1, cash_amount: 5000 }] },
      { id: 'side-a', name: 'Best Junior', is_main: false, order_idx: 1, prizes: [{ id: 's1', place: 1, cash_amount: 3000 }] },
      { id: 'side-b', name: 'Best Local', is_main: false, order_idx: 2, prizes: [{ id: 's2', place: 1, cash_amount: 2000 }] },
    ];

    const players = [
      { id: 'p1', name: 'Top Seed', rank: 1, rating: 2000, state: 'MH' },
      { id: 'p2', name: 'Second Seed', rank: 2, rating: 1900, state: 'MH' },
      { id: 'p3', name: 'Third Seed', rank: 3, rating: 1800, state: 'MH' },
    ];

    const { winners } = runAllocation(allocator, categories as any, players, {
      ...defaultRules,
      multi_prize_policy: 'single',
    });

    const winsByPlayer = new Map<string, string[]>();
    for (const win of winners) {
      const list = winsByPlayer.get(win.playerId) ?? [];
      list.push(win.prizeId);
      winsByPlayer.set(win.playerId, list);
    }

    expect(winners).toHaveLength(3);
    expect(winsByPlayer.get('p1')).toEqual(['m1']);
    expect(winsByPlayer.get('p2')).toEqual(['s1']);
    expect(winsByPlayer.get('p3')).toEqual(['s2']);
  });

  it('allows sweeping all eligible prizes when policy=unlimited', () => {
    const categories = [
      { id: 'main', name: 'Main', is_main: true, order_idx: 0, prizes: [{ id: 'm1', place: 1, cash_amount: 6000 }] },
      { id: 'side-a', name: 'Best Junior', is_main: false, order_idx: 1, prizes: [{ id: 's1', place: 1, cash_amount: 4000 }] },
      { id: 'side-b', name: 'Best Female', is_main: false, order_idx: 2, criteria_json: { gender: 'F' }, prizes: [{ id: 's2', place: 1, cash_amount: 1000 }] },
    ];

    const players = [
      { id: 'p1', name: 'Top Seed', rank: 1, rating: 2100, gender: 'M' },
      { id: 'p2', name: 'Second Seed', rank: 2, rating: 1900, gender: 'F' },
    ];

    const { winners } = runAllocation(allocator, categories as any, players, {
      ...defaultRules,
      multi_prize_policy: 'unlimited',
    });

    const winsByPlayer = new Map<string, string[]>();
    for (const win of winners) {
      const list = winsByPlayer.get(win.playerId) ?? [];
      list.push(win.prizeId);
      winsByPlayer.set(win.playerId, list);
    }

    expect(winners).toHaveLength(3);
    expect(winsByPlayer.get('p1')).toEqual(['m1', 's1']);
    expect(winsByPlayer.get('p2')).toEqual(['s2']);
  });

  it('caps to one main + one side when policy=main_plus_one_side', () => {
    const categories = [
      { id: 'main', name: 'Main', is_main: true, order_idx: 0, prizes: [{ id: 'm1', place: 1, cash_amount: 8000 }] },
      { id: 'side-a', name: 'Best Junior', is_main: false, order_idx: 1, prizes: [{ id: 's1', place: 1, cash_amount: 5000 }] },
      { id: 'side-b', name: 'Best Local', is_main: false, order_idx: 2, prizes: [{ id: 's2', place: 1, cash_amount: 3000 }] },
      { id: 'side-c', name: 'Best U1600', is_main: false, order_idx: 3, prizes: [{ id: 's3', place: 1, cash_amount: 2000 }] },
    ];

    const players = [
      { id: 'p1', name: 'Top Seed', rank: 1, rating: 1900, state: 'MH' },
      { id: 'p2', name: 'Second Seed', rank: 2, rating: 1750, state: 'MH' },
      { id: 'p3', name: 'Third Seed', rank: 3, rating: 1600, state: 'MH' },
    ];

    const { winners } = runAllocation(allocator, categories as any, players, {
      ...defaultRules,
      multi_prize_policy: 'main_plus_one_side',
    });

    const winsByPlayer = new Map<string, string[]>();
    for (const win of winners) {
      const list = winsByPlayer.get(win.playerId) ?? [];
      list.push(win.prizeId);
      winsByPlayer.set(win.playerId, list);
    }

    expect(winners).toHaveLength(4);
    expect(winsByPlayer.get('p1')).toEqual(['m1', 's1']);
    expect(winsByPlayer.get('p2')).toEqual(['s2']);
    expect(winsByPlayer.get('p3')).toEqual(['s3']);
    expect(Math.max(...Array.from(winsByPlayer.values()).map(v => v.length))).toBeLessThanOrEqual(2);
  });
});
