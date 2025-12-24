import { expect, test } from '@playwright/test';

const SUPABASE_HOST = 'https://nvjjifnzwrueutbirpde.supabase.co';
const SMOKE_TOURNAMENT = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Smoke Test Open',
  start_date: '2025-01-10',
  end_date: '2025-01-12',
  city: 'Testville',
  venue: 'Main Hall',
  public_slug: 'smoke-test-open',
  created_at: '2025-01-01T00:00:00.000Z',
};

const PUBLISHED_DETAILS = {
  id: SMOKE_TOURNAMENT.id,
  title: SMOKE_TOURNAMENT.title,
  start_date: SMOKE_TOURNAMENT.start_date,
  end_date: SMOKE_TOURNAMENT.end_date,
  venue: SMOKE_TOURNAMENT.venue,
  city: SMOKE_TOURNAMENT.city,
  event_code: 'STO-2025',
  notes: null,
  brochure_url: null,
  chessresults_url: null,
  public_results_url: null,
  public_slug: SMOKE_TOURNAMENT.public_slug,
  time_control_base_minutes: 90,
  time_control_increment_seconds: 30,
  chief_arbiter: null,
  tournament_director: null,
  entry_fee_amount: null,
  cash_prize_total: null,
};

const PUBLISHED_RESULTS = {
  id: SMOKE_TOURNAMENT.id,
  title: SMOKE_TOURNAMENT.title,
  slug: SMOKE_TOURNAMENT.public_slug,
  brochure_url: null,
};

function withCorsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'content-type': 'application/json',
  };
}

test.describe('@smoke public navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${SUPABASE_HOST}/**`, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: withCorsHeaders() });
        return;
      }

      const url = new URL(request.url());
      const path = url.pathname;

      if (path.startsWith('/rest/v1/tournaments')) {
        const idFilter = url.searchParams.get('id');
        if (idFilter?.startsWith('eq.')) {
          await route.fulfill({
            status: 200,
            headers: withCorsHeaders(),
            body: JSON.stringify({
              id: SMOKE_TOURNAMENT.id,
              title: SMOKE_TOURNAMENT.title,
              city: SMOKE_TOURNAMENT.city,
              start_date: SMOKE_TOURNAMENT.start_date,
              end_date: SMOKE_TOURNAMENT.end_date,
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          headers: withCorsHeaders(),
          body: JSON.stringify([SMOKE_TOURNAMENT]),
        });
        return;
      }

      if (path.startsWith('/rest/v1/published_tournaments')) {
        const responsePayload = url.searchParams.get('select')?.includes('slug')
          ? PUBLISHED_RESULTS
          : PUBLISHED_DETAILS;
        await route.fulfill({
          status: 200,
          headers: withCorsHeaders(),
          body: JSON.stringify(responsePayload),
        });
        return;
      }

      if (path.startsWith('/rest/v1/allocations')) {
        const select = url.searchParams.get('select') ?? '';
        await route.fulfill({
          status: 200,
          headers: withCorsHeaders(),
          body: select.includes('version') ? 'null' : '[]',
        });
        return;
      }

      if (path.startsWith('/functions/v1/publicTeamPrizes')) {
        await route.fulfill({
          status: 200,
          headers: withCorsHeaders(),
          body: JSON.stringify({
            hasTeamPrizes: false,
            groups: [],
            players_loaded: 0,
            max_rank: 0,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers: withCorsHeaders(),
        body: JSON.stringify([]),
      });
    });
  });

  test('home page navigates to tournament details and back @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /tournament results/i })).toBeVisible();

    const card = page.getByRole('heading', { name: SMOKE_TOURNAMENT.title });
    await expect(card).toBeVisible();

    await page.getByRole('link', { name: /view details/i }).click();
    await expect(page).toHaveURL(`/p/${SMOKE_TOURNAMENT.public_slug}`);
    await expect(page.getByRole('heading', { name: SMOKE_TOURNAMENT.title })).toBeVisible();

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('results page back button returns to home @smoke', async ({ page }) => {
    await page.goto(`/p/${SMOKE_TOURNAMENT.public_slug}/results`);
    await expect(page.getByRole('heading', { name: SMOKE_TOURNAMENT.title })).toBeVisible();

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL('/');
  });
});
