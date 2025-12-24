import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';

export type FinalPrizeExportRow = {
  'Category Order': number;
  'Category Name': string;
  Place: number;
  'Player Name': string;
  Rank: number | string;
  Amount: number;
  Trophy: 'Yes' | 'No';
  Medal: 'Yes' | 'No';
  'Club/Institution': string;
  State: string;
};

export function buildFinalPrizeExportRows(winners: FinalPrizeWinnerRow[]): FinalPrizeExportRow[] {
  return winners.map((winner, index) => ({
    'Category Order': winner.categoryOrder ?? index + 1,
    'Category Name': winner.categoryName ?? '',
    Place: winner.place,
    'Player Name': winner.playerName ?? '',
    Rank: winner.rank ?? '',
    Amount: winner.amount ?? 0,
    Trophy: winner.hasTrophy ? 'Yes' : 'No',
    Medal: winner.hasMedal ? 'Yes' : 'No',
    'Club/Institution': winner.club ?? '',
    State: winner.state ?? '',
  }));
}
