import type * as AllocatorModule from '../../supabase/functions/allocatePrizes/index';

export const defaultRules = {
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

export type TestPlayer = {
  id: string;
  name: string;
  rank: number;
  rating?: number | null;
  dob?: string | null;
  gender?: string | null;
  state?: string | null;
};

export type TestPrize = {
  id: string;
  place: number;
  cash_amount: number;
  has_trophy?: boolean;
  has_medal?: boolean;
  is_active?: boolean;
};

export type TestCategory = {
  id: string;
  name: string;
  is_main: boolean;
  order_idx: number;
  category_type?: string;
  criteria_json?: any;
  prizes: TestPrize[];
};

export type AllocationResult = {
  winners: Array<{ prizeId: string; playerId: string; reasons: string[]; isManual: boolean; categoryId: string }>;
  unfilled: Array<{ prizeId: string; reasonCodes: string[]; categoryId: string }>;
};

export function runAllocation(
  allocator: typeof AllocatorModule,
  categories: TestCategory[],
  players: TestPlayer[],
  rules = defaultRules,
  startDate = new Date('2024-01-01')
): AllocationResult {
  const prizeQueue = categories.flatMap(cat =>
    cat.prizes.map(p => ({ cat, p }))
  );

  prizeQueue.sort((a, b) => allocator.cmpPrize(a, b));

  const winners: AllocationResult['winners'] = [];
  const unfilled: AllocationResult['unfilled'] = [];
  const assignedPlayers = new Set<string>();

  for (const { cat, p } of prizeQueue) {
    const eligible: Array<{ player: TestPlayer; passCodes: string[]; warnCodes: string[] }> = [];

    for (const player of players) {
      if (assignedPlayers.has(player.id)) continue;

      const evaluation = allocator.evaluateEligibility(player, cat as any, rules, startDate);
      if (evaluation.eligible) {
        eligible.push({ player, passCodes: evaluation.passCodes, warnCodes: evaluation.warnCodes });
      }
    }

    if (eligible.length === 0) {
      unfilled.push({ prizeId: p.id, reasonCodes: ['no_eligible_players'], categoryId: cat.id });
      continue;
    }

    const isYoungest = allocator.isYoungestCategory(cat);
    if (isYoungest) {
      eligible.sort(allocator.compareYoungestEligible);
    } else {
      eligible.sort((a, b) => allocator.compareEligibleByRankRatingName(a, b, rules.tie_break_strategy));
    }

    const [winner] = eligible;
    winners.push({
      prizeId: p.id,
      playerId: winner.player.id,
      reasons: winner.passCodes,
      isManual: false,
      categoryId: cat.id,
    });
    assignedPlayers.add(winner.player.id);
  }

  return { winners, unfilled };
}

export function getWinnersByCategory(winners: AllocationResult['winners']): Map<string, AllocationResult['winners']> {
  const map = new Map<string, AllocationResult['winners']>();
  for (const w of winners) {
    const list = map.get(w.categoryId) ?? [];
    list.push(w);
    map.set(w.categoryId, list);
  }
  return map;
}
