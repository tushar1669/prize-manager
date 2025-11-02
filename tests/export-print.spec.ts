import { expect, test } from '@playwright/test';

const SUPABASE_BASE = 'https://nvjjifnzwrueutbirpde.supabase.co';
const TOURNAMENT_ID = 'TEST_TOURNAMENT_ID';

const mockTournament = {
  title: 'Mock Championship',
  city: 'Chennai',
  start_date: '2024-05-01',
  end_date: '2024-05-05'
};

const mockPlayers = [
  {
    id: 'player-1',
    rank: 1,
    name: 'Aditi Chess',
    rating: 2150,
    dob: '1990-05-12',
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
    gender: 'M',
    state: 'KA',
    city: 'Bengaluru',
    club: 'Knight Riders',
    tournament_id: TOURNAMENT_ID
  }
];

const mockCategories = [
  {
    id: 'cat-1',
    name: 'Open',
    is_main: true,
    prizes: [
      {
        id: 'prize-1',
        place: 1,
        cash_amount: 10000,
        has_trophy: true,
        has_medal: true,
        is_active: true
      }
    ]
  }
];

test.describe('Print export', () => {
  test('opens print window and masks DOB', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (message) => {
      consoleMessages.push(message.text());
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

      if (path.endsWith('/tournaments')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify(mockTournament) });
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

      if (path.endsWith('/allocations')) {
        await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([]) });
        return;
      }

      await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify([]) });
    });

    await page.addInitScript(({ tournamentId }) => {
      const winners = [
        {
          prizeId: 'prize-1',
          playerId: 'player-1',
          reasons: [],
          isManual: false
        }
      ];

      history.replaceState({ winners }, '', location.href);

      (window as any).__PRINT_HTML__ = '';
      (window as any).__PRINT_TRIGGERED__ = false;

      const stubWindow = {
        document: {
          open() {},
          write(html: string) {
            (window as any).__PRINT_HTML__ = html;
          },
          close() {},
          title: ''
        },
        focus() {},
        print() {
          (window as any).__PRINT_TRIGGERED__ = true;
        }
      } as Window;

      window.open = () => stubWindow as any;
    }, { tournamentId: TOURNAMENT_ID });

    await page.goto(`/t/${TOURNAMENT_ID}/finalize`);

    await page.getByRole('button', { name: /Export PDF \(Print\)/i }).click();

    await page.waitForTimeout(300);

    const html = await page.evaluate(() => (window as any).__PRINT_HTML__ as string);
    expect(html).toContain('Mock Championship');
    expect(html).toContain('<thead>');
    expect(html).toContain('1990-05');
    expect(html).toMatch(/DOB masked to yyyy-mm/i);

    const triggered = await page.evaluate(() => (window as any).__PRINT_TRIGGERED__);
    expect(triggered).toBeTruthy();

    expect(consoleMessages.some((msg) => msg.includes('[export.print] start'))).toBeTruthy();
    expect(consoleMessages.some((msg) => msg.includes('[export.print] ok'))).toBeTruthy();
  });
});
