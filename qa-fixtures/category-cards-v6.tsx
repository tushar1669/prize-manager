import React from 'react';
import { createRoot } from 'react-dom/client';
import { CategoryCardsView } from '../src/components/final-prize/CategoryCardsView';
import { CategoryCardsUpdatedView } from '../src/components/final-prize/CategoryCardsUpdatedView';
import type { FinalPrizeCategoryGroup, FinalPrizeWinnerRow } from '../src/hooks/useFinalPrizeData';
import '../src/index.css';

const scenario = new URLSearchParams(location.search).get('scenario') || 'normal';
const isPreview = scenario === 'preview';
const isLong = scenario === 'long';
const noGift = scenario === 'no-gift';

function makeWinner(category: string, i: number, gift = false): FinalPrizeWinnerRow {
  return {
    prizeId: `${category}-prize-${i}`,
    place: i,
    amount: i === 1 ? 15000 : 2000 + (i * 113),
    categoryId: category,
    categoryName: category,
    categoryOrder: category === 'main' ? 0 : 1,
    isMain: category === 'main',
    hasTrophy: i === 1,
    hasMedal: i <= 3,
    hasGift: gift,
    giftItems: gift ? [{ name: 'Synthetic Fixture Chess Set', qty: 2 }] : [],
    playerId: `${category}-player-${i}`,
    playerName: isLong ? `Player-${String(i).padStart(3, '0')} Long Multiword Test Name With Extra Words` : `Player-${String(i).padStart(3, '0')}`,
    rank: i,
    club: 'Synthetic Academy',
    state: 'TEST',
  };
}

function group(id: string, title: string, main: boolean, count: number, gift: boolean): FinalPrizeCategoryGroup {
  return {
    category: { id, name: title, is_main: main, order_idx: main ? 0 : 1 },
    winners: Array.from({ length: count }, (_, i) => makeWinner(id, i + 1, gift)),
  };
}

const groups: FinalPrizeCategoryGroup[] = isLong
  ? [group('main', 'MAIN PRIZES - LONG TEST CATEGORY', true, 90, true)]
  : [
      group('main', 'Main Prizes', true, isPreview ? 6 : 4, !noGift),
      group('girls', 'Under-12 Girls', false, 3, !noGift),
      group('open', 'Under-16 Open', false, 3, false),
    ];
const hasFullAccess = !isPreview;
const previewMainLimit = 2;

createRoot(document.getElementById('root')!).render(
  <div>
    <div className="pm-print-surface" id="qa-updated">
      <CategoryCardsUpdatedView groups={groups} hasFullAccess={hasFullAccess} previewMainLimit={previewMainLimit} />
    </div>
    <div id="qa-legacy" style={{ display: 'none' }} aria-hidden>
      <CategoryCardsView groups={groups} hasFullAccess={hasFullAccess} previewMainLimit={previewMainLimit} />
    </div>
  </div>
);
