import { describe, expect, it } from 'vitest';
import type { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { buildFinalPrizeExportRows } from '@/utils/finalPrizeExport';

describe('buildFinalPrizeExportRows', () => {
  it('keeps the player name plain text and isolates trophy/medal columns', () => {
    const winners: FinalPrizeWinnerRow[] = [
      {
        prizeId: 'p1',
        place: 1,
        amount: 1000,
        categoryId: 'c1',
        categoryName: 'Open',
        categoryOrder: 1,
        isMain: true,
        hasTrophy: true,
        hasMedal: false,
        playerId: 'player-1',
        playerName: 'Aditi Sharma',
        rank: 12,
        club: 'Queen Club',
        state: 'TN',
      },
    ];

    const [row] = buildFinalPrizeExportRows(winners);

    expect(row['Player Name']).toBe('Aditi Sharma');
    expect(row['Player Name']).not.toMatch(/TROPHY|🏆|🥇/i);
    expect(row.Trophy).toBe('Yes');
    expect(row.Medal).toBe('No');
  });
});
