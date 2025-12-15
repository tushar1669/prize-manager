import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { defaultRules, getWinnersByCategory, runAllocation } from './helpers';
import { categories, players, startDate, totalPrizes } from '../fixtures/golden/new-delhi-below1800';

let allocator: typeof AllocatorModule;

const playerById = new Map(players.map(p => [p.id, p]));
const prizePlace = new Map<string, number>();
for (const cat of categories) {
  for (const prize of cat.prizes) {
    prizePlace.set(prize.id, prize.place);
  }
}

describe('Golden fixture: New Delhi Below-1800', () => {
  beforeAll(async () => {
    (globalThis as any).Deno = { serve: vi.fn(), env: { get: vi.fn() } };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('awards every prize and preserves rank ordering across main and girls prizes', () => {
    const { winners, unfilled } = runAllocation(allocator, categories, players, defaultRules, startDate);

    expect(winners).toHaveLength(totalPrizes);
    expect(unfilled).toHaveLength(0);

    const winnersByCat = getWinnersByCategory(winners);

    // Each girls category must have coverage
    for (const catId of ['u08g', 'u11g', 'u14g', 'u17g']) {
      expect(winnersByCat.get(catId)?.length ?? 0).toBeGreaterThan(0);
    }

    // Best female prizes go to female players
    for (const winner of winnersByCat.get('bf') ?? []) {
      const player = playerById.get(winner.playerId);
      expect(player?.gender).toBe('F');
    }

    // Main category winners follow ascending rank order
    const mainWinners = [...(winnersByCat.get('main') ?? [])].sort(
      (a, b) => (prizePlace.get(a.prizeId) ?? 0) - (prizePlace.get(b.prizeId) ?? 0)
    );
    const ranks = mainWinners.map(w => playerById.get(w.playerId)?.rank ?? Number.MAX_SAFE_INTEGER);
    for (let i = 1; i < ranks.length; i += 1) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });
});
