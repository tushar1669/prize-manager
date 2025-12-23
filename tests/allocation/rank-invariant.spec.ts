import { beforeAll, describe, expect, it, vi } from 'vitest';
import './setupAllocatorMocks';
import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';
import { runAllocation } from './helpers';

let allocator: typeof AllocatorModule;

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

type Player = {
  id: string;
  name: string;
  rank: number;
  rating?: number | null;
  dob?: string | null;
  gender?: string | null;
  state?: string | null;
};

type Prize = {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy?: boolean;
  has_medal?: boolean;
  is_active?: boolean;
};

type Category = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  category_type?: string;
  criteria_json?: unknown;
  prizes: Prize[];
};

type Winner = {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
};

/**
 * INVARIANT: For unknown category (except youngest), the winner of each prize must be
 * the best-ranked (lowest rank number) eligible player who hasn't already won a prize.
 * 
 * This helper verifies that no unassigned player with a better rank was skipped.
 */
function verifyRankInvariant(
  categories: Category[],
  players: Player[],
  winners: Winner[],
  rules: unknown,
  referenceDate: Date
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const assignedPlayers = new Set<string>();
  
  // Build prize-to-category lookup
  const prizeToCategory = new Map<string, Category>();
  for (const cat of categories) {
    for (const prize of cat.prizes) {
      prizeToCategory.set(prize.id, cat);
    }
  }
  
  // Build winner lookup
  const winnerByPrize = new Map<string, Winner>();
  for (const w of winners) {
    winnerByPrize.set(w.prizeId, w);
  }
  
  // Sort prizes by the same order as allocator (value desc, then category order)
  const prizeQueue = categories.flatMap(cat => 
    cat.prizes.map(p => ({ cat, p }))
  );
  prizeQueue.sort((a, b) => allocator.cmpPrize(a, b));
  
  // Process prizes in order
  for (const { cat, p } of prizeQueue) {
    const winner = winnerByPrize.get(p.id);
    if (!winner) continue; // Prize unfilled
    
    const isYoungest = allocator.isYoungestCategory(cat);
    
    // Get all eligible players for this prize
    const eligiblePlayers: Player[] = [];
    for (const player of players) {
      if (assignedPlayers.has(player.id)) continue;
      
      const evaluation = allocator.evaluateEligibility(player, cat, rules, referenceDate);
      if (evaluation.eligible) {
        eligiblePlayers.push(player);
      }
    }
    
    // Find the winner player
    const winnerPlayer = players.find(p => p.id === winner.playerId);
    if (!winnerPlayer) {
      violations.push(`Prize ${p.id}: Winner ${winner.playerId} not found in players`);
      continue;
    }
    
    // For youngest categories, sorting is by DOB, not rank
    if (isYoungest) {
      // Youngest invariant: winner should have the most recent DOB (or best tie-breaker)
      const sortedByDob = [...eligiblePlayers].sort((a, b) => {
        const wrapper = (pl: Player) => ({ player: pl, passCodes: [], warnCodes: [] });
        return allocator.compareYoungestEligible(wrapper(a), wrapper(b));
      });
      
      if (sortedByDob.length > 0 && sortedByDob[0].id !== winner.playerId) {
        const best = sortedByDob[0];
        violations.push(
          `Prize ${p.id} (${cat.name}): Youngest winner ${winnerPlayer.name}(dob=${winnerPlayer.dob}) ` +
          `but ${best.name}(dob=${best.dob}) is younger and was eligible`
        );
      }
    } else {
      // Standard invariant: winner should have the best (lowest) rank among eligible
      const bestRankedEligible = eligiblePlayers.reduce((best, curr) => {
        if (!best) return curr;
        if ((curr.rank ?? Infinity) < (best.rank ?? Infinity)) return curr;
        return best;
      }, null as Player | null);
      
      if (bestRankedEligible && bestRankedEligible.id !== winner.playerId) {
        const winnerRank = winnerPlayer.rank ?? Infinity;
        const bestRank = bestRankedEligible.rank ?? Infinity;
        
        if (bestRank < winnerRank) {
          violations.push(
            `Prize ${p.id} (${cat.name}): Winner ${winnerPlayer.name}(rank=${winnerRank}) ` +
            `but ${bestRankedEligible.name}(rank=${bestRank}) has better rank and was eligible`
          );
        }
      }
    }
    
    // Mark winner as assigned
    assignedPlayers.add(winner.playerId);
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Run a full allocation simulation and verify the rank invariant
 */
function runAllocationAndVerify(
  categories: Category[],
  players: Player[],
  rules = defaultRules,
  referenceDate = new Date('2024-01-01')
) {
  // Build prize queue
  const prizeQueue = categories.flatMap(cat => 
    cat.prizes.map(p => ({ cat, p }))
  );
  prizeQueue.sort((a, b) => allocator.cmpPrize(a, b));
  
  const winners: Winner[] = [];
  const assignedPlayers = new Set<string>();
  
  for (const { cat, p } of prizeQueue) {
    const isYoungest = allocator.isYoungestCategory(cat);
    
    // Find eligible unassigned players
    const eligible: Array<{ player: Player; passCodes: string[]; warnCodes: string[] }> = [];
    for (const player of players) {
      if (assignedPlayers.has(player.id)) continue;
      
      const evaluation = allocator.evaluateEligibility(player, cat as unknown, rules, referenceDate);
      if (evaluation.eligible) {
        eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
      }
    }
    
    if (eligible.length === 0) continue;
    
    // Sort by appropriate comparator
    if (isYoungest) {
      eligible.sort(allocator.compareYoungestEligible);
    } else {
      eligible.sort((a, b) => allocator.compareEligibleByRankRatingName(a, b, rules.tie_break_strategy));
    }
    
    const winner = eligible[0];
    assignedPlayers.add(winner.player.id);
    winners.push({
      prizeId: p.id,
      playerId: winner.player.id,
      reasons: ['auto'],
      isManual: false
    });
  }
  
  // Verify invariant
  const result = verifyRankInvariant(categories, players, winners, rules, referenceDate);
  
  return { winners, ...result };
}

describe('Rank Invariant Tests', () => {
  beforeAll(async () => {
    (globalThis as unknown).Deno = {
      serve: vi.fn(),
      env: { get: vi.fn() },
    };
    allocator = await import('../../supabase/functions/allocatePrizes/index');
  });

  it('basic: best ranked player wins each prize', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1500 },
      { id: 'p2', name: 'Bob', rank: 2, rating: 1400 },
      { id: 'p3', name: 'Carol', rank: 3, rating: 1300 },
    ];
    
    const categories: Category[] = [{
      id: 'cat-main',
      name: 'Main',
      is_main: true,
      order_idx: 0,
      criteria_json: {},
      prizes: [
        { id: 'prize-1', place: 1, cash_amount: 1000 },
        { id: 'prize-2', place: 2, cash_amount: 500 },
        { id: 'prize-3', place: 3, cash_amount: 250 },
      ]
    }];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.winners.find(w => w.prizeId === 'prize-1')?.playerId).toBe('p1');
    expect(result.winners.find(w => w.prizeId === 'prize-2')?.playerId).toBe('p2');
    expect(result.winners.find(w => w.prizeId === 'prize-3')?.playerId).toBe('p3');
  });

  it('overlapping categories: better-ranked player gets higher-value prize', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1500 },
      { id: 'p2', name: 'Bob', rank: 2, rating: 1400 },
      { id: 'p3', name: 'Carol', rank: 3, rating: 1300 },
    ];
    
    const categories: Category[] = [
      {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'main-1', place: 1, cash_amount: 1000 }]
      },
      {
        id: 'cat-rating',
        name: 'Under 1600',
        is_main: false,
        order_idx: 1,
        criteria_json: { max_rating: 1600 },
        prizes: [{ id: 'rating-1', place: 1, cash_amount: 500 }]
      }
    ];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    // Alice (rank 1) should get Main 1st ($1000)
    // Bob (rank 2) should get Rating 1st ($500)
    expect(result.winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('p1');
    expect(result.winners.find(w => w.prizeId === 'rating-1')?.playerId).toBe('p2');
  });

  it('category-specific eligibility: best eligible player wins', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1800, gender: 'F' },
      { id: 'p2', name: 'Bob', rank: 2, rating: 1600, gender: 'M' },
      { id: 'p3', name: 'Carol', rank: 3, rating: 1400, gender: 'F' },
    ];
    
    const categories: Category[] = [
      {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [{ id: 'main-1', place: 1, cash_amount: 1000 }]
      },
      {
        id: 'cat-female',
        name: 'Best Female',
        is_main: false,
        order_idx: 1,
        criteria_json: { gender: 'F' },
        prizes: [{ id: 'female-1', place: 1, cash_amount: 500 }]
      }
    ];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    // Alice (rank 1, female) gets Main 1st
    // Carol (rank 3, female) gets Female 1st (Bob is not eligible)
    expect(result.winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('p1');
    expect(result.winners.find(w => w.prizeId === 'female-1')?.playerId).toBe('p3');
  });

  it('complex: multiple overlapping categories with different eligibility', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1800, gender: 'F', state: 'MH' },
      { id: 'p2', name: 'Bob', rank: 2, rating: 1600, gender: 'M', state: 'MH' },
      { id: 'p3', name: 'Carol', rank: 3, rating: 1400, gender: 'F', state: 'KA' },
      { id: 'p4', name: 'Dan', rank: 4, rating: 1200, gender: 'M', state: 'MH' },
      { id: 'p5', name: 'Eve', rank: 5, rating: 1100, gender: 'F', state: 'MH' },
    ];
    
    const categories: Category[] = [
      {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 1000 },
          { id: 'main-2', place: 2, cash_amount: 500 },
        ]
      },
      {
        id: 'cat-female',
        name: 'Best Female',
        is_main: false,
        order_idx: 1,
        criteria_json: { gender: 'F' },
        prizes: [{ id: 'female-1', place: 1, cash_amount: 400 }]
      },
      {
        id: 'cat-local',
        name: 'Best in MH',
        is_main: false,
        order_idx: 2,
        criteria_json: { allowed_states: ['MH'] },
        prizes: [{ id: 'local-1', place: 1, cash_amount: 300 }]
      },
      {
        id: 'cat-u1500',
        name: 'Under 1500',
        is_main: false,
        order_idx: 3,
        criteria_json: { max_rating: 1500 },
        prizes: [{ id: 'u1500-1', place: 1, cash_amount: 200 }]
      }
    ];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    
    // Expected allocation (by cash value order):
    // Main 1st ($1000): Alice (rank 1) - everyone eligible
    // Main 2nd ($500): Bob (rank 2) - Alice assigned
    // Female 1st ($400): Carol (rank 3) - Alice/Bob assigned, Carol is best eligible female
    // Local MH ($300): Dan (rank 4) - Alice/Bob/Carol assigned or not from MH
    // U1500 ($200): Eve (rank 5) - others assigned or >1500 rating
    expect(result.winners.find(w => w.prizeId === 'main-1')?.playerId).toBe('p1');
    expect(result.winners.find(w => w.prizeId === 'main-2')?.playerId).toBe('p2');
    expect(result.winners.find(w => w.prizeId === 'female-1')?.playerId).toBe('p3');
    expect(result.winners.find(w => w.prizeId === 'local-1')?.playerId).toBe('p4');
    expect(result.winners.find(w => w.prizeId === 'u1500-1')?.playerId).toBe('p5');
  });

  it('youngest category uses DOB, not rank', () => {
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1500, dob: '2010-01-01', gender: 'F' },
      { id: 'p2', name: 'Beth', rank: 5, rating: 1200, dob: '2014-06-15', gender: 'F' }, // younger
      { id: 'p3', name: 'Carol', rank: 2, rating: 1400, dob: '2012-03-10', gender: 'F' },
    ];
    
    const categories: Category[] = [{
      id: 'cat-youngest',
      name: 'Youngest Girl',
      is_main: false,
      order_idx: 0,
      category_type: 'youngest_female',
      criteria_json: {},
      prizes: [{ id: 'youngest-1', place: 1, cash_amount: 500 }]
    }];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    // Beth (rank 5, DOB 2014) should win because she's youngest, not Alice (rank 1)
    expect(result.winners.find(w => w.prizeId === 'youngest-1')?.playerId).toBe('p2');
  });

  it('stress test: 10 players, 5 categories, no violations', () => {
    const players: Player[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      rank: i + 1,
      rating: 1800 - i * 100,
      gender: i % 2 === 0 ? 'F' : 'M',
      dob: `${2010 + (i % 5)}-0${(i % 9) + 1}-15`,
    }));
    
    const categories: Category[] = [
      {
        id: 'cat-main',
        name: 'Main',
        is_main: true,
        order_idx: 0,
        criteria_json: {},
        prizes: [
          { id: 'main-1', place: 1, cash_amount: 1000 },
          { id: 'main-2', place: 2, cash_amount: 500 },
          { id: 'main-3', place: 3, cash_amount: 250 },
        ]
      },
      {
        id: 'cat-female',
        name: 'Best Female',
        is_main: false,
        order_idx: 1,
        criteria_json: { gender: 'F' },
        prizes: [
          { id: 'female-1', place: 1, cash_amount: 400 },
          { id: 'female-2', place: 2, cash_amount: 200 },
        ]
      },
      {
        id: 'cat-male',
        name: 'Best Male',
        is_main: false,
        order_idx: 2,
        criteria_json: { gender: 'M' },
        prizes: [{ id: 'male-1', place: 1, cash_amount: 350 }]
      },
      {
        id: 'cat-u1500',
        name: 'Under 1500',
        is_main: false,
        order_idx: 3,
        criteria_json: { max_rating: 1500, include_unrated: true },
        prizes: [{ id: 'u1500-1', place: 1, cash_amount: 150 }]
      },
      {
        id: 'cat-youngest',
        name: 'Youngest Girl',
        is_main: false,
        order_idx: 4,
        category_type: 'youngest_female',
        criteria_json: {},
        prizes: [{ id: 'youngest-1', place: 1, cash_amount: 100 }]
      }
    ];
    
    const result = runAllocationAndVerify(categories, players);
    
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('detects violation if sorting is wrong (regression test)', () => {
    // This test ensures the invariant checker itself works
    const players: Player[] = [
      { id: 'p1', name: 'Alice', rank: 1, rating: 1500 },
      { id: 'p2', name: 'Bob', rank: 2, rating: 1400 },
    ];
    
    const categories: Category[] = [{
      id: 'cat-main',
      name: 'Main',
      is_main: true,
      order_idx: 0,
      criteria_json: {},
      prizes: [{ id: 'main-1', place: 1, cash_amount: 1000 }]
    }];
    
    // Manually create a "wrong" winner (Bob instead of Alice)
    const wrongWinners: Winner[] = [{
      prizeId: 'main-1',
      playerId: 'p2', // Bob (rank 2) instead of Alice (rank 1)
      reasons: ['test'],
      isManual: false
    }];
    
    const result = verifyRankInvariant(
      categories, 
      players, 
      wrongWinners, 
      defaultRules, 
      new Date('2024-01-01')
    );
    
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Alice');
    expect(result.violations[0]).toContain('better rank');
  });

  it('keeps main prizes monotone by rank when multiple awards are present', () => {
    const categories: Category[] = [
      {
        id: 'main',
        name: 'Open',
        is_main: true,
        order_idx: 0,
        prizes: [
          { id: 'm1', place: 1, cash_amount: 5000 },
          { id: 'm2', place: 2, cash_amount: 3000 },
          { id: 'm3', place: 3, cash_amount: 2000 },
        ],
      },
    ];

    const players: Player[] = [
      { id: 'p1', name: 'Top Seed', rank: 1, rating: 2100 },
      { id: 'p2', name: 'Second Seed', rank: 2, rating: 2050 },
      { id: 'p3', name: 'Third Seed', rank: 3, rating: 1900 },
      { id: 'p4', name: 'Fourth Seed', rank: 4, rating: 1800 },
    ];

    const { winners } = runAllocation(allocator, categories, players, defaultRules, new Date('2024-01-01'));
    const ordered = winners.sort((a, b) => (a.prizeId > b.prizeId ? 1 : -1));
    const ranks = ordered.map(w => players.find(p => p.id === w.playerId)?.rank ?? Infinity);

    expect(ranks).toEqual([1, 2, 3]);
  });

  it('orders rating-group prizes by rank before considering rating/name tie-breaks', () => {
    const categories: Category[] = [
      {
        id: 'rg',
        name: '1600-1800',
        is_main: false,
        order_idx: 0,
        criteria_json: { min_rating: 1600, max_rating: 1800 },
        prizes: [
          { id: 'rg-1', place: 1, cash_amount: 2500 },
          { id: 'rg-2', place: 2, cash_amount: 1500 },
        ],
      },
    ];

    const players: Player[] = [
      { id: 'p1', name: 'Lower Rating Better Rank', rank: 5, rating: 1620 },
      { id: 'p2', name: 'Higher Rating Lower Rank', rank: 6, rating: 1780 },
      { id: 'p3', name: 'Backup', rank: 7, rating: 1700 },
    ];

    const { winners } = runAllocation(allocator, categories, players, defaultRules, new Date('2024-01-01'));
    const ordered = winners.sort((a, b) => (a.prizeId > b.prizeId ? 1 : -1));
    const ranks = ordered.map(w => players.find(p => p.id === w.playerId)?.rank ?? Infinity);

    // Rank should win over higher rating for the first prize
    expect(ranks).toEqual([5, 6]);
  });
});
