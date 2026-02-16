import React from 'react';
import { render } from '@testing-library/react';
import { CategoryCardsView } from '@/components/final-prize/CategoryCardsView';
import type { FinalPrizeCategoryGroup } from '@/hooks/useFinalPrizeData';

describe('CategoryCardsView print layout', () => {
  it('renders one print-safe card per category', () => {
    const groups: FinalPrizeCategoryGroup[] = [
      {
        category: { id: 'main', name: 'Main', is_main: true, order_idx: 0 },
        winners: [
          {
            prizeId: 'p1',
            place: 1,
            amount: 100,
            categoryId: 'main',
            categoryName: 'Main',
            categoryOrder: 0,
            isMain: true,
            hasTrophy: true,
            hasMedal: false,
            hasGift: false,
            giftItems: [],
            playerId: 'pl1',
            playerName: 'Alice',
          },
        ],
      },
      {
        category: { id: 'u12', name: 'U12', is_main: false, order_idx: 1 },
        winners: [
          {
            prizeId: 'p2',
            place: 1,
            amount: 50,
            categoryId: 'u12',
            categoryName: 'U12',
            categoryOrder: 1,
            isMain: false,
            hasTrophy: false,
            hasMedal: true,
            hasGift: false,
            giftItems: [],
            playerId: 'pl2',
            playerName: 'Ben',
          },
        ],
      },
    ];

    const { container } = render(React.createElement(CategoryCardsView, { groups }));
    const cards = container.querySelectorAll('[data-category-card]');

    expect(cards).toHaveLength(2);
    cards.forEach(card => {
      expect(card.classList.contains('pm-print-avoid-break')).toBe(true);
    });
  });
});
