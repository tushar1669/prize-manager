import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { stripAwardMarkers } from '@/utils/prizeAwards';
import { formatGiftItems } from '@/utils/giftItems';

export type FinalPrizeExportRow = {
  'Category Order': number;
  'Category Name': string;
  Place: number;
  'Player Name': string;
  Rank: number | string;
  Amount: number;
  Trophy: 'Yes' | 'No';
  Medal: 'Yes' | 'No';
  'Has Gift': 'Yes' | 'No';
  'Gift Items': string;
  'Club/Institution': string;
  State: string;
};

export function buildFinalPrizeExportRows(winners: FinalPrizeWinnerRow[]): FinalPrizeExportRow[] {
  return winners.map((winner, index) => ({
    'Category Order': winner.categoryOrder ?? index + 1,
    'Category Name': winner.categoryName ?? '',
    Place: winner.place,
    'Player Name': stripAwardMarkers(winner.playerName ?? ''),
    Rank: winner.rank ?? '',
    Amount: winner.amount ?? 0,
    Trophy: winner.hasTrophy ? 'Yes' : 'No',
    Medal: winner.hasMedal ? 'Yes' : 'No',
    'Has Gift': winner.hasGift ? 'Yes' : 'No',
    'Gift Items': formatGiftItems(winner.giftItems),
    'Club/Institution': winner.club ?? '',
    State: winner.state ?? '',
  }));
}
