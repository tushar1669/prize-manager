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
 * Sort ceremony items by category order, then by place descending within each category.
 * This produces the correct ceremony announcement order:
 * - Non-main categories first (by brochure order)
 * - Team prizes
 * - Main category last (Champion announced last)
 * Within each category: 3rd, 2nd, 1st (lowest place announced last)
 */
export function sortCeremonyItems(items: CeremonyItem[]): CeremonyItem[] {
  return [...items].sort((a, b) => {
    // Main categories always come last
    if (a.isMain !== b.isMain) return a.isMain ? 1 : -1;
    // Then by category order (brochure order)
    if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    // Within category: highest place first (3rd, 2nd, 1st) so 1st is announced last
    return b.place - a.place;
  });
}
