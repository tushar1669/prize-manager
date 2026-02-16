// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CategoryCardsView } from '@/components/final-prize/CategoryCardsView';
import { PosterGridView } from '@/components/final-prize/PosterGridView';
import type { FinalPrizeCategoryGroup, FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import * as prizeAwards from '@/utils/prizeAwards';

describe('award icon helper usage', () => {
  it('shares the award helper across Category Cards and Poster Grid', () => {
    const fixtures: FinalPrizeWinnerRow[] = [
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
        rank: 1,
      },
      {
        prizeId: 'p2',
        place: 2,
        amount: 80,
        categoryId: 'main',
        categoryName: 'Main',
        categoryOrder: 0,
        isMain: true,
        hasTrophy: false,
        hasMedal: true,
        hasGift: false,
        giftItems: [],
        playerId: 'pl2',
        playerName: 'Bharat',
        rank: 2,
      },
      {
        prizeId: 'p3',
        place: 4,
        amount: 50,
        categoryId: 'u12',
        categoryName: 'U12',
        categoryOrder: 1,
        isMain: false,
        hasTrophy: false,
        hasMedal: false,
        hasGift: false,
        giftItems: [],
        playerId: 'pl3',
        playerName: 'Chitra',
        rank: 3,
      },
    ];

    const expectations = [
      { hasTrophy: true, hasMedal: false },
      { hasTrophy: false, hasMedal: true },
      { hasTrophy: false, hasMedal: false },
    ];

    fixtures.forEach((fixture, index) => {
      expect(prizeAwards.getAwardFlagsForPrizeRow(fixture)).toEqual(expectations[index]);
    });

    const spy = vi.spyOn(prizeAwards, 'getAwardFlagsForPrizeRow');

    const groups: FinalPrizeCategoryGroup[] = [
      {
        category: { id: 'main', name: 'Main', is_main: true, order_idx: 0 },
        winners: fixtures.slice(0, 2),
      },
      {
        category: { id: 'u12', name: 'U12', is_main: false, order_idx: 1 },
        winners: fixtures.slice(2),
      },
    ];

    render(React.createElement(CategoryCardsView, { groups }));
    render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PosterGridView, { winners: fixtures, tournamentId: 't1' })
      )
    );

    expect(spy).toHaveBeenCalledTimes(fixtures.length * 2);
  });
});
