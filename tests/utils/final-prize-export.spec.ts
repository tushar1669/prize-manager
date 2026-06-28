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
        hasGift: true,
        giftItems: [{ name: 'Chess Clock', qty: 1 }],
        playerId: 'player-1',
        playerName: 'Aditi Sharma 🏆 TROPHY',
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
    expect(row['Has Gift']).toBe('Yes');
    expect(row['Gift Items']).toBe('Chess Clock');
  });

  it('formats quantity greater than one and multiple gifts compactly', () => {
    const winners: FinalPrizeWinnerRow[] = [
      {
        prizeId: 'p1',
        place: 1,
        amount: 0,
        categoryId: 'c1',
        categoryName: 'Open',
        categoryOrder: 1,
        isMain: true,
        hasTrophy: false,
        hasMedal: false,
        hasGift: true,
        giftItems: [
          { name: 'Chess Book', qty: 2 },
          { name: 'Medal Voucher', qty: 1 },
        ],
        playerId: 'player-1',
        playerName: 'Aditi Sharma',
        rank: 12,
        club: 'Queen Club',
        state: 'TN',
      },
    ];

    const [row] = buildFinalPrizeExportRows(winners);

    expect(row['Has Gift']).toBe('Yes');
    expect(row['Gift Items']).toBe('Chess Book ×2, Medal Voucher');
  });
});
