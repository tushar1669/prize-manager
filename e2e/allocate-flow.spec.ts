import { test, expect } from '@playwright/test';

const SUPABASE_BASE = 'https://nvjjifnzwrueutbirpde.supabase.co';
const TOURNAMENT_ID = 'TEST_TOURNAMENT_ID';

const mockPlayers = [
  {
    id: 'player-1',
    rank: 1,
    name: 'Aditi Chess',
    rating: 2150,
    dob: '1990-05-12',
    dob_raw: '1990-05-12',
    gender: 'F',
    state: 'TN',
    city: 'Chennai',
    club: 'Queen Club',
    tournament_id: TOURNAMENT_ID
  },
  {
    id: 'player-2',
    rank: 2,
    name: 'Rohan Moves',
    rating: 1980,
    dob: '1989-11-23',
    dob_raw: '1989-11-23',
    gender: 'M',
    state: 'KA',
    city: 'Bengaluru',
    club: 'Knight Riders',
    tournament_id: TOURNAMENT_ID
  }
];

const mockCategories = [
  {
    id: 'cat-main',
    name: 'Open',
    tournament_id: TOURNAMENT_ID,
    prizes: [
      {
        id: 'prize-main-1',
        place: 1,
        cash_amount: 10000,
        has_trophy: true,
        has_medal: true,
        is_active: true
      },
      {
        id: 'prize-main-2',
        place: 2,
        cash_amount: 5000,
        has_trophy: false,
        has_medal: true,
        is_active: true
      }
    ]
  },
  {
    id: 'cat-women',
    name: 'Women',
    tournament_id: TOURNAMENT_ID,
    prizes: [
      {
        id: 'prize-women-1',
        place: 1,
        cash_amount: 6000,
        has_trophy: true,
        has_medal: true,
        is_active: true
      }
    ]
  }
];

const allocationResponse = {
  winners: [
    {
      prizeId: 'prize-main-1',
      playerId: 'player-1',
      reasons: ['auto', 'rank'],
      isManual: false
    },
    {
      prizeId: 'prize-women-1',
      playerId: 'player-2',
      reasons: ['gender_ok', 'rating_ok'],
      isManual: false
    }
  ],
  conflicts: [],
  unfilled: [
    {
      prizeId: 'prize-main-2',
      reasonCodes: ['no_eligible_players']
    }
  ],
  meta: {
    playerCount: mockPlayers.length,
    activePrizeCount: 3,
    winnersCount: 2,
    conflictCount: 0,
    unfilledCount: 1
  },
  logs: [
    `[alloc] tid=${TOURNAMENT_ID} players=${mockPlayers.length} categories=${mockCategories.length} prizes=3`,
    '[alloc.win] prize=prize-main-1 player=player-1 rank=1 reasons=auto,rank',
    '[alloc.unfilled] prize=prize-main-2 reason=no_eligible_players'
  ]
};

test.describe('Allocation review flow', () => {
  test('renders reason chips and carries meta data into finalize', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (message) => {
      consoleMessages.push(message.text());
    });

    await page.addInitScript(() => {
      const win = window as typeof window & { __ALLOC_STATE__?: { meta: unknown; unfilled: unknown } };
      win.__ALLOC_STATE__ = { meta: null, unfilled: null };

      const originalPushState = history.pushState;
      history.pushState = function pushStateWithAlloc(state: unknown, title: string, url?: string | URL | null) {
        const allocState = (window as typeof window & { __ALLOC_STATE__?: { meta: unknown; unfilled: unknown } }).__ALLOC_STATE__;
        if (state && typeof state === 'object' && allocState) {
          const typedState = state as Record<string, unknown>;
          if (allocState.meta && typeof typedState.previewMeta === 'undefined') {
            typedState.previewMeta = allocState.meta;
          }
          if (allocState.meta && typeof typedState.meta === 'undefined') {
            typedState.meta = allocState.meta;
          }
          if (allocState.unfilled && typeof typedState.unfilled === 'undefined') {
            typedState.unfilled = allocState.unfilled;
          }
          if (allocState.meta && typeof typedState.unfilledCount === 'undefined') {
            typedState.unfilledCount = allocState.meta.unfilledCount;
          }
          if (allocState.meta && typeof typedState.conflictsCount === 'undefined' && typeof typedState.conflictCount === 'undefined') {
            typedState.conflictsCount = allocState.meta.conflictCount;
          }
        }
        return originalPushState.call(this, state, title, url as unknown);
      };
    });

    await page.route(`${SUPABASE_BASE}/rest/v1/*`, async (route) => {
      const { method } = route.request();
      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*'
          }
        });
        return;
      }

      const url = new URL(route.request().url());
      const path = url.pathname;
      const jsonHeaders = {
        'access-control-allow-origin': '*',
        'content-type': 'application/json'
      };

      if (method === 'HEAD') {
        await route.fulfill({
          status: 200,
          headers: {
            ...jsonHeaders,
            'content-range': `0-${mockPlayers.length - 1}/${mockPlayers.length}`
          },
          body: ''
        });
        return;
      }

      if (path.endsWith('/players')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(mockPlayers) });
        return;
      }

      if (path.endsWith('/categories')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(mockCategories) });
        return;
      }

      if (path.endsWith('/rule_config')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([]) });
        return;
      }

      if (path.endsWith('/allocations')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([]) });
        return;
      }

      await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([]) });
    });

    await page.route(`${SUPABASE_BASE}/functions/v1/allocatePrizes`, async (route) => {
      const { method } = route.request();
      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*'
          }
        });
        return;
      }

      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': 'application/json'
          },
          body: JSON.stringify(allocationResponse)
        });

        await page.evaluate((payload) => {
          const win = window as typeof window & { __ALLOC_STATE__?: { meta: unknown; unfilled: unknown } };
          win.__ALLOC_STATE__ = { meta: payload.meta, unfilled: payload.unfilled };
          if (Array.isArray(payload.logs)) {
            payload.logs.forEach((line) => console.log(line));
          }
        }, allocationResponse);
        return;
      }

      await route.continue();
    });

    await page.goto(`/t/${TOURNAMENT_ID}/review`);

    await expect(page.getByRole('heading', { name: /Winners \(2\)/i })).toBeVisible();
    await expect(page.getByText('Auto allocated')).toBeVisible();
    await expect(page.getByText('Rank priority')).toBeVisible();
    await expect(page.getByText('Gender eligible')).toBeVisible();
    await expect(page.getByText('Rating eligible')).toBeVisible();

    await expect(page.getByRole('heading', { name: /Unfilled Prizes \(1\)/i })).toBeVisible();
    await expect(page.getByText('No eligible players')).toBeVisible();

    await expect(page.getByText('Winners: 2')).toBeVisible();
    await expect(page.getByText('Conflicts: 0')).toBeVisible();
    await expect(page.getByText('Unfilled: 1')).toBeVisible();

    expect(consoleMessages.some((msg) => msg.includes('[alloc'))).toBeTruthy();

    const finalizeButton = page.getByRole('button', { name: /Finalize/i });
    await expect(finalizeButton).toBeEnabled();
    await finalizeButton.click();

    await expect(page).toHaveURL(`/t/${TOURNAMENT_ID}/finalize`);

    await expect(page.getByText('Winners: 2')).toBeVisible();
    await expect(page.getByText('Conflicts: 0')).toBeVisible();
    await expect(page.getByText('Unfilled: 1')).toBeVisible();
  });
});
