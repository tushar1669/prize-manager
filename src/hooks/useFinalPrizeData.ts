import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeSelectPlayersByIds } from '@/utils/safeSelectPlayers';

export interface FinalPrizeWinnerRow {
  prizeId: string;
  place: number;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryOrder: number;
  isMain: boolean;
  hasTrophy: boolean;
  hasMedal: boolean;
  playerId: string;
  playerName: string;
  sno?: string | null;
  rank?: number | null;
  club?: string | null;
  state?: string | null;
}

export interface FinalPrizeCategoryGroup {
  category: {
    id: string;
    name: string;
    is_main: boolean;
    order_idx: number | null;
  };
  winners: FinalPrizeWinnerRow[];
}

export interface FinalPrizeData {
  tournament: {
    id: string;
    title: string;
    city?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  winners: FinalPrizeWinnerRow[];
  totals: {
    totalPrizes: number;
    totalCash: number;
    mainCount: number;
    categoryCount: number;
  };
  categories: {
    id: string;
    name: string;
    is_main: boolean;
    order_idx: number | null;
  }[];
}

async function fetchFinalPrizeData(tournamentId: string): Promise<FinalPrizeData> {
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, title, city, start_date, end_date')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tournamentError) {
    throw tournamentError;
  }

  const { data: allocations, error: allocationError } = await supabase
    .from('allocations')
    .select('player_id, prize_id')
    .eq('tournament_id', tournamentId);

  if (allocationError) {
    throw allocationError;
  }

  if (!allocations || allocations.length === 0) {
    return {
      tournament: tournament ?? null,
      winners: [],
      totals: {
        totalPrizes: 0,
        totalCash: 0,
        mainCount: 0,
        categoryCount: 0,
      },
      categories: [],
    };
  }

  const prizeIds = Array.from(
    new Set(allocations.map(a => a.prize_id).filter(Boolean) as string[])
  );

  const { data: prizes, error: prizeError } = await supabase
    .from('prizes')
    .select('id, place, cash_amount, has_trophy, has_medal, category_id')
    .in('id', prizeIds);

  if (prizeError) {
    throw prizeError;
  }

  const categoryIds = Array.from(
    new Set(prizes?.map(p => p.category_id).filter(Boolean) as string[])
  );

  const { data: categories, error: categoryError } = await supabase
    .from('categories')
    .select('id, name, is_main, order_idx')
    .in('id', categoryIds);

  if (categoryError) {
    throw categoryError;
  }

  const playerIds = Array.from(
    new Set(allocations.map(a => a.player_id).filter(Boolean) as string[])
  );

  const { data: players } = await safeSelectPlayersByIds(playerIds, [
    'id',
    'name',
    'rank',
    'sno',
    'club',
    'state',
  ]);

  const categoryLookup = new Map((categories || []).map(category => [category.id, category]));

  const winners = (allocations || [])
    .map(alloc => {
      const prize = prizes?.find(p => p.id === alloc.prize_id);
      const player = players?.find(p => p.id === alloc.player_id);
      const category = prize?.category_id ? categoryLookup.get(prize.category_id) : undefined;
      if (!prize || !player || !category) return null;

      return {
        prizeId: prize.id,
        place: prize.place || 0,
        amount: Number(prize.cash_amount) || 0,
        categoryId: category.id,
        categoryName: category.name,
        categoryOrder: typeof category.order_idx === 'number' ? category.order_idx : 999,
        isMain: !!category.is_main,
        hasTrophy: !!prize.has_trophy,
        hasMedal: !!prize.has_medal,
        playerId: player.id,
        playerName: player.name || 'Unknown Player',
        sno: player.sno,
        rank: player.rank,
        club: player.club,
        state: player.state,
      } satisfies FinalPrizeWinnerRow;
    })
    .filter(Boolean) as FinalPrizeWinnerRow[];

  const unique = new Map<string, FinalPrizeWinnerRow>();
  winners.forEach(winner => {
    if (!unique.has(winner.prizeId)) {
      unique.set(winner.prizeId, winner);
    }
  });

  const deduped = Array.from(unique.values()).sort((a, b) => {
    // is_main DESC (main categories first)
    if (a.isMain !== b.isMain) {
      return a.isMain ? -1 : 1;
    }

    // order_idx ASC (brochure order)
    const orderA = typeof a.categoryOrder === 'number' ? a.categoryOrder : 999;
    const orderB = typeof b.categoryOrder === 'number' ? b.categoryOrder : 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // place ASC
    if (a.place !== b.place) {
      return (a.place || 0) - (b.place || 0);
    }

    // fallback: player name alphabetical
    return a.playerName.localeCompare(b.playerName);
  });

  const totals = deduped.reduce(
    (acc, winner) => {
      acc.totalPrizes += 1;
      acc.totalCash += Number.isFinite(winner.amount) ? winner.amount : 0;
      if (winner.isMain) {
        acc.mainCount += 1;
      }
      return acc;
    },
    { totalPrizes: 0, totalCash: 0, mainCount: 0 }
  );
  const distinctCategoryCount = new Set(deduped.map(w => w.categoryId)).size;

  return {
    tournament: tournament ?? null,
    winners: deduped,
    totals: {
      totalPrizes: totals.totalPrizes,
      totalCash: totals.totalCash,
      mainCount: totals.mainCount,
      categoryCount: distinctCategoryCount,
    },
    categories: (categories || []).sort((a, b) => {
      // is_main DESC (main categories first)
      if (a.is_main !== b.is_main) {
        return a.is_main ? -1 : 1;
      }
      // order_idx ASC (brochure order)
      const aIdx = typeof a.order_idx === 'number' ? a.order_idx : 999;
      const bIdx = typeof b.order_idx === 'number' ? b.order_idx : 999;
      if (aIdx !== bIdx) return aIdx - bIdx;
      // fallback: name alphabetical
      return a.name.localeCompare(b.name);
    }),
  };
}

export function useFinalPrizeData(tournamentId?: string) {
  const query = useQuery({
    queryKey: ['final-prize-data', tournamentId],
    enabled: !!tournamentId,
    queryFn: () => fetchFinalPrizeData(tournamentId as string),
  });

  const grouped = useMemo(() => {
    const data = query.data;
    if (!data) {
      return {
        byCategory: new Map<string, FinalPrizeWinnerRow[]>(),
        groups: [] as FinalPrizeCategoryGroup[],
      };
    }

    const byCategory = new Map<string, FinalPrizeWinnerRow[]>();
    data.winners.forEach(winner => {
      if (!byCategory.has(winner.categoryId)) {
        byCategory.set(winner.categoryId, []);
      }
      byCategory.get(winner.categoryId)!.push(winner);
    });

    byCategory.forEach(list => {
      list.sort((a, b) => a.place - b.place || a.playerName.localeCompare(b.playerName));
    });

    const groups: FinalPrizeCategoryGroup[] = data.categories.map(category => ({
      category,
      winners: byCategory.get(category.id) ?? [],
    }));

    return { byCategory, groups };
  }, [query.data]);

  return { ...query, grouped };
}
