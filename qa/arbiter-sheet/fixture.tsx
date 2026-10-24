import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArbiterSheetView } from '../../src/components/final-prize/ArbiterSheetView';
import { FinalPrizeSummaryHeader } from '../../src/components/final-prize/FinalPrizeSummaryHeader';
import type { FinalPrizeWinnerRow } from '../../src/hooks/useFinalPrizeData';
import '../../src/index.css';

const query = new URLSearchParams(window.location.search);
const count = query.get('size') === 'long' ? 42 : 12;
const restricted = query.get('access') === 'restricted';
const noGift = query.get('gift') === 'none';
const categoryData = [
  { id: 'main', name: 'Main Prizes', order: 0, isMain: true },
  { id: 'girls', name: 'Under 12 Girls', order: 1, isMain: false },
  { id: 'open', name: 'Under 16 Open', order: 2, isMain: false },
] as const;
const winners: FinalPrizeWinnerRow[] = Array.from({ length: count }, (_, index) => {
  const group = categoryData[Math.floor(index / Math.ceil(count / 3)) % 3];
  const place = index % Math.ceil(count / 3) + 1;
  const gift = !noGift && index % 7 === 0;
  return {
    prizeId: `synthetic-prize-${index + 1}`,
    playerId: `synthetic-player-${index + 1}`,
    categoryId: group.id,
    categoryName: group.name,
    categoryOrder: group.order,
    isMain: group.isMain,
    place, rank: index + 1,
    playerName: `Synthetic Winner ${String(index + 1).padStart(3, '0')} — Internationally Recognized Long Multiword Player Name`,
    amount: index === 0 ? 15000 : 2200 + index * 113,
    hasTrophy: index % 11 === 0,
    hasMedal: index % 4 === 0,
    hasGift: gift,
    giftItems: gift ? [{ name: 'Synthetic Chess Board with Long Travel Carry Case', qty: 2 }] : [],
    club: 'Synthetic Academy',
    state: 'TEST',
  };
});
const totalCash = winners.reduce((total, winner) => total + winner.amount, 0);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="pm-print-page">
        <FinalPrizeSummaryHeader
          tournamentTitle="Synthetic Arbiter Sheet — Design QA"
          city="Testville"
          dateRange="01–02 Oct 2026"
          winners={winners}
          totals={{ totalPrizes: count, totalCash, mainCount: Math.ceil(count / 3), categoryCount: 3 }}
          hasFullAccess={!restricted}
        />
        <main className="pm-print-surface">
          <ArbiterSheetView winners={winners} hasFullAccess={!restricted} />
        </main>
      </div>
    </QueryClientProvider>
  </React.StrictMode>
);
