export interface WinnerRow {
  winner: { prizeId: string; playerId: string; isManual?: boolean };
  prize?: {
    id: string;
    place?: number | null;
    cash_amount?: number | null;
    category_id?: string | null;
    category_name?: string | null;
    category_order?: number | null;
    category_criteria?: unknown;
    has_trophy?: boolean | null;
    has_medal?: boolean | null;
  };
  player?: {
    id?: string | null;
    name?: string | null;
    rating?: number | null;
    rank?: number | null;
  };
}

export interface WinnerCategoryGroup {
  id: string;
  name: string;
  order: number;
  winners: WinnerRow[];
}

export const sortWinnersByAmount = (rows: WinnerRow[]): WinnerRow[] => {
  return [...rows].sort((a, b) => {
    const amountDiff = (b.prize?.cash_amount ?? 0) - (a.prize?.cash_amount ?? 0);
    if (amountDiff !== 0) return amountDiff;
    const categoryDiff = (a.prize?.category_order ?? 999) - (b.prize?.category_order ?? 999);
    if (categoryDiff !== 0) return categoryDiff;
    const placeDiff = (a.prize?.place ?? 0) - (b.prize?.place ?? 0);
    if (placeDiff !== 0) return placeDiff;
    return (a.player?.name ?? '').localeCompare(b.player?.name ?? '');
  });
};

export const groupWinnersByCategory = (rows: WinnerRow[]): WinnerCategoryGroup[] => {
  const byCategory = new Map<string, WinnerCategoryGroup>();

  rows.forEach(row => {
    const categoryId = row.prize?.category_id ?? 'unknown';
    const categoryName = row.prize?.category_name ?? 'Unknown Category';
    const categoryOrder = row.prize?.category_order ?? 999;
    if (!byCategory.has(categoryId)) {
      byCategory.set(categoryId, {
        id: categoryId,
        name: categoryName,
        order: categoryOrder,
        winners: [],
      });
    }
    byCategory.get(categoryId)!.winners.push(row);
  });

  const groups = Array.from(byCategory.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  groups.forEach(group => {
    group.winners.sort((a, b) => {
      const placeDiff = (a.prize?.place ?? 0) - (b.prize?.place ?? 0);
      if (placeDiff !== 0) return placeDiff;
      return (a.player?.name ?? '').localeCompare(b.player?.name ?? '');
    });
  });

  return groups;
};
