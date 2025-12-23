import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { defaultRules, getWinnersByCategory, runAllocation } from './helpers';
import { categories, players, startDate, totalPrizes } from '../fixtures/golden/khasdar-2025';

let allocator: typeof AllocatorModule;

const playerById = new Map(players.map(p => [p.id, p]));
const prizeMeta = new Map<string, { categoryId: string; place: number; min?: number; max?: number }>();
for (const cat of categories) {
  for (const prize of cat.prizes) {
    prizeMeta.set(prize.id, {
      categoryId: cat.id,
      place: prize.place,
      min: cat.criteria_json?.min_rating,
      max: cat.criteria_json?.max_rating,
    });
  }
}

describe('Golden fixture: Khasdar Chashak 2025', () => {
  beforeAll(async () => {
    (globalThis as unknown).Deno = { serve: vi.fn(), env: { get: vi.fn() } };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('keeps main prizes ordered by rank and enforces rating bands', () => {
    const { winners, unfilled } = runAllocation(allocator, categories, players, defaultRules, startDate);

    expect(winners).toHaveLength(totalPrizes);
    expect(unfilled).toHaveLength(0);

    const winnersByCat = getWinnersByCategory(winners);

    // Rating bands: every winner stays within declared range
    for (const winner of winners) {
      const meta = prizeMeta.get(winner.prizeId);
      const player = playerById.get(winner.playerId);
      if (!meta?.min && !meta?.max) continue;
      const rating = player?.rating ?? 0;
      if (meta.min != null) expect(rating).toBeGreaterThanOrEqual(meta.min);
      if (meta.max != null) expect(rating).toBeLessThanOrEqual(meta.max);
    }

    // Main category prizes respect rank ordering
    const mainWinners = [...(winnersByCat.get('k-main') ?? [])].sort(
      (a, b) => (prizeMeta.get(a.prizeId)?.place ?? 0) - (prizeMeta.get(b.prizeId)?.place ?? 0)
    );
    const ranks = mainWinners.map(w => playerById.get(w.playerId)?.rank ?? Number.MAX_SAFE_INTEGER);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });
});
