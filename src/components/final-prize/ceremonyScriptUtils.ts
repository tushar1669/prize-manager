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

export function sortCeremonyItems(items: CeremonyItem[], announceSmallestFirst: boolean): CeremonyItem[] {
  return [...items].sort((a, b) => {
    const amountDiff = announceSmallestFirst ? a.amount - b.amount : b.amount - a.amount;
    if (amountDiff !== 0) return amountDiff;
    if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
    if (a.place !== b.place) return a.place - b.place;
    return 0;
  });
}
