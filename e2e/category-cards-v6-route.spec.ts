import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// Synthetic route-only browser QA. No production authentication, data, RPC or writes.
// The real App -> ProtectedRoute -> FinalPrizeView -> CategoryCardsUpdatedView renders.
// Every request to the live Supabase hostname is intercepted before it can leave the browser.
const BACKEND = 'https://nvjjifnzwrueutbirpde.supabase.co';
const ID = '11111111-1111-4111-8111-111111111111';
const UID = '22222222-2222-4222-8222-222222222222';
const AUTH_KEY = 'sb-nvjjifnzwrueutbirpde-auth-token';
const route = '/t/' + ID + '/final/v6';
const user = {
  id: UID, aud: 'authenticated', role: 'authenticated', email: 'qa-user@example.invalid',
  created_at: '2025-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
};

type Scenario = 'full' | 'preview' | 'denied' | 'long' | 'no-gift';
function buildData(scenario: Scenario) {
  const isLong = scenario === 'long';
  const isNoGift = scenario === 'no-gift';
  const defs = isLong
    ? [{ id: 'main', name: 'MAIN PRIZES LONG SYNTHETIC CATEGORY', is_main: true, order_idx: 0, count: 90 }]
    : [
      { id: 'main', name: 'Main Prizes', is_main: true, order_idx: 0, count: 6 },
      { id: 'girls', name: 'Under-12 Girls', is_main: false, order_idx: 1, count: 3 },
      { id: 'open', name: 'Under-16 Open', is_main: false, order_idx: 2, count: 3 },
    ];
  const categories = defs.map(({ count, ...item }) => item);
  const prizes = defs.flatMap(d => Array.from({ length: d.count }, (_, i) => ({
    id: d.id + '-prize-' + (i + 1),
    category_id: d.id, place: i + 1, cash_amount: i === 0 ? 15000 : 2000 + i * 113,
    has_trophy: i === 0, has_medal: i < 3,
    gift_items: !isNoGift && d.id !== 'open' ? [{ name: 'Synthetic Chess Set', qty: 2 }] : [],
  })));
  const allocations = prizes.map(p => ({
    prize_id: p.id, player_id: p.id.replace('-prize-', '-player-'), version: 1,
  }));
  const players = allocations.map((a, i) => ({
    id: a.player_id, name: 'Player-' + String(i + 1).padStart(3, '0') + (isLong ? ' Long Multiword Synthetic Test Name' : ''),
    full_name: null, rank: i + 1, club: 'Synthetic Academy', state: 'TEST',
  }));
  return { categories, prizes, allocations, players };
}

async function installMockBackend(page: Page, scenario: Scenario) {
  const data = buildData(scenario);
  const rejected: string[] = [];
  const visited: string[] = [];
  await page.route(BACKEND + '/**', async handler => {
    const req = handler.request();
    const uri = new URL(req.url());
    const path = uri.pathname;
    const method = req.method();
    visited.push(method + ' ' + path);
    const respond = async (body: unknown, status = 200, extra?: Record<string, string>) =>
      handler.fulfill({
        status, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS', ...extra },
        body: JSON.stringify(body),
      });
    if (method === 'OPTIONS') return respond({}, 200);
    if (path === '/auth/v1/user' && method === 'GET') return respond(user);
    if (path === '/rest/v1/user_roles' && method === 'GET') {
      return respond({ role: 'organizer', is_verified: true });
    }
    // SERVER-AUTHORITATIVE ACCESS is mocked here: this proves client handling, not real server authorization.
    if (path === '/rest/v1/rpc/get_tournament_access_state' && method === 'POST') {
      if (scenario === 'denied') return respond({ code: 'PGRST202', message: 'Synthetic access RPC unavailable' }, 404);
      const full = scenario !== 'preview';
      return respond({
        has_full_access: full, is_free_small_tournament: false,
        players_count: data.players.length, preview_main_limit: 2, free_player_threshold: 100,
      });
    }
    // The app may start a background onboarding reward; refuse it (no real writes).
    if (method !== 'GET') {
      rejected.push(method + ' ' + path);
      return respond({ code: 'QA_DENIED', message: 'Synthetic QA refuses mutations' }, 403);
    }
    if (path === '/rest/v1/tournaments') {
      return respond({ id: ID, title: 'Synthetic Tournament Route QA', city: 'Testville',
        start_date: '2026-10-01', end_date: '2026-10-02' });
    }
    if (path === '/rest/v1/allocations') {
      const select = uri.searchParams.get('select') || '';
      return respond(select === 'version' ? { version: 1 } : data.allocations);
    }
    if (path === '/rest/v1/prizes') return respond(data.prizes);
    if (path === '/rest/v1/categories') return respond(data.categories);
    if (path === '/rest/v1/players') {
      const select = uri.searchParams.get('select') || '';
      return respond(select === '*' ? data.players.slice(0, 1) : data.players,
        200, { 'content-range': '0-' + Math.max(data.players.length - 1, 0) + '/' + data.players.length });
    }
    // Any unrecognized read is denied rather than being sent to production.
    rejected.push(method + ' ' + path);
    return respond({ code: 'QA_DENIED', message: 'Unmocked synthetic QA read' }, 403);
  });
  return { rejected, visited, data };
}

async function seedSyntheticSession(page: Page) {
  await page.addInitScript(({ authKey, syntheticUser }) => {
    const session = {
      access_token: 'synthetic-browser-session-not-a-real-jwt',
      refresh_token: 'synthetic-local-only-refresh',
      token_type: 'bearer', expires_in: 2000000000, expires_at: 4000000000,
      user: syntheticUser,
    };
    localStorage.setItem(authKey, JSON.stringify(session));
  }, { authKey: AUTH_KEY, syntheticUser: user });
}

async function mount(page: Page, scenario: Scenario, authenticated = true) {
  const requests = await installMockBackend(page, scenario);
  if (authenticated) await seedSyntheticSession(page);
  await page.goto(route);
  return requests;
}

test('anonymous user is redirected away from the protected v6 route', async ({ page }) => {
  const requests = await mount(page, 'full', false);
  await expect(page).toHaveURL(/\/auth(?:\?|$)/, { timeout: 15000 });
  await expect(page.locator('.pm-category-cards-updated')).toHaveCount(0);
  expect(requests.visited.every(v => !v.includes('/rpc/get_tournament_access_state'))).toBe(true);
});

test('synthetic organizer route: v6 winner data matches legacy v1, full entitlement enables print', async ({ page }) => {
  const requests = await mount(page, 'full');
  await expect(page.locator('.pm-category-cards-updated .pmv6-category')).toHaveCount(3, { timeout: 25000 });
  await expect(page).toHaveURL(new RegExp('/t/' + ID + '/final/v6$'));
  expect(await page.locator('.pmv6-name').allTextContents()).toHaveLength(12);
  const namesV6 = await page.locator('.pmv6-name').allTextContents();
  const amountsV6 = await page.locator('.pmv6-amount').allTextContents();
  const print = page.getByRole('button', { name: /^print$/i });
  await expect(print).toBeEnabled();
  await page.goto('/t/' + ID + '/final/v1');
  await expect(page.locator('[data-category-card]')).toHaveCount(3, { timeout: 25000 });
  const namesV1 = await page.locator('[data-category-card] tbody tr td:nth-child(2) .font-semibold').allTextContents();
  const amountsV1 = await page.locator('[data-category-card] tbody tr td:nth-child(4)').allTextContents();
  expect(namesV6).toEqual(namesV1);
  expect(amountsV6).toEqual(amountsV1);
  expect(requests.visited).toContain('POST /rest/v1/rpc/get_tournament_access_state');
});

test('synthetic RPC preview mode hides non-main details, limits main and disables print', async ({ page }) => {
  await mount(page, 'preview');
  await expect(page.locator('.pm-category-cards-updated .pmv6-category')).toHaveCount(3, { timeout: 25000 });
  await expect(page.locator('.pmv6-name')).toHaveCount(2);
  await expect(page.locator('.pmv6-locked')).toHaveCount(2);
  await expect(page.locator('.pmv6-locked-note')).toContainText('4 more prizes hidden');
  await expect(page.getByRole('button', { name: /^print$/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /export xlsx/i })).toBeDisabled();
  const visible = await page.locator('.pm-category-cards-updated').innerText();
  expect(visible).not.toContain('Player-007');
  expect(visible).not.toContain('Player-010');
});

test('synthetic RPC failure preserves fail-closed preview and disabled print', async ({ page }) => {
  await mount(page, 'denied');
  await expect(page.locator('.pm-category-cards-updated .pmv6-category')).toHaveCount(3, { timeout: 25000 });
  // On unavailable access RPC, fallback is the existing eight-row Main preview, not the synthetic RPC's two-row limit.
  await expect(page.locator('.pmv6-name')).toHaveCount(6);
  await expect(page.locator('.pmv6-locked')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^print$/i })).toBeDisabled();
  expect(await page.locator('.pm-category-cards-updated').innerText()).not.toContain('Player-007');
});

test('real route v6 long-content A4 PDF keeps 90 synthetic winners and footer on every page without background graphics', async ({ page }) => {
  await mount(page, 'long');
  await expect(page.locator('.pmv6-name')).toHaveCount(90, { timeout: 25000 });
  const img = page.locator('.pmv6-print-logo-preload');
  await img.evaluate((element: HTMLImageElement) => element.decode());
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: false });
  mkdirSync('qa-output', { recursive: true });
  writeFileSync('qa-output/category-v6-actual-route-long-no-background.pdf', pdf);
  const info = execFileSync('pdfinfo', ['-'], { input: pdf, encoding: 'utf8' });
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  expect(pages).toBeGreaterThan(1);
  const a4 = info.match(/Page size:\s+([0-9.]+) x ([0-9.]+) pts/);
  expect(a4).not.toBeNull();
  expect(Math.abs(Number(a4![1]) - 595)).toBeLessThan(0.2);
  expect(Math.abs(Number(a4![2]) - 842)).toBeLessThan(0.2);
  const content = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' });
  for (let n = 1; n <= 90; n++) expect(content).toContain('Player-' + String(n).padStart(3, '0'));
  expect((content.match(/DERA Tech/g) || []).length).toBe(pages);
  const images = execFileSync('pdfimages', ['-list', '-'], { input: pdf, encoding: 'utf8' });
  const imagePages = images.split('\n').slice(2).filter(line => /^\s*\d+\s+\d+\s+image\s/.test(line))
    .map(line => Number(line.trim().split(/\s+/)[0]));
  expect(new Set(imagePages)).toEqual(new Set(Array.from({ length: pages }, (_, i) => i + 1)));
  console.log('QA_ROUTE_LONG_A4', pages, 'pages, 90 synthetic winners, every-page official footer');
});

test('real route v6 no-gift A4 PDF has no gift column', async ({ page }) => {
  await mount(page, 'no-gift');
  await expect(page.locator('.pmv6-name')).toHaveCount(12, { timeout: 25000 });
  await expect(page.locator('.pmv6-table--gift')).toHaveCount(0);
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: false });
  mkdirSync('qa-output', { recursive: true });
  writeFileSync('qa-output/category-v6-actual-route-no-gift.pdf', pdf);
  const text = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' });
  expect(text).toContain('Main Prizes');
  expect(text).toContain('Under-12 Girls');
  expect(text).toContain('Under-16 Open');
  expect(text).not.toContain('Winner details');
});
