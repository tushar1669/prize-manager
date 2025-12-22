export interface CeremonyItem {
  type: 'individual' | 'team';
  // For sorting
  isMain: boolean;
  categoryOrder: number;
  place: number;
  amount: number;
  // Display data
  categoryName: string;
  playerName: string; // or institution name for teams
  prizeId: string;
  rank?: number | null;
  sno?: string | null;
  club?: string | null;
  state?: string | null;
  hasTrophy?: boolean;
  hasMedal?: boolean;
  // Team-specific
  teamPlayers?: Array<{ name: string; rank: number }>;
  totalPoints?: number;
}

/**
 * Sort ceremony items by category order, then by place ascending within each category.
 * This produces a stable ceremony order that matches the category order used elsewhere.
 */
export function sortCeremonyItems(items: CeremonyItem[]): CeremonyItem[] {
  return [...items].sort((a, b) => {
    // Then by category order (brochure order)
    if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    // Within category: lowest place first (1st, 2nd, 3rd)
    if (a.place !== b.place) return a.place - b.place;
    return a.prizeId.localeCompare(b.prizeId);
  });
}
