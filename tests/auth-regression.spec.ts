import { test, expect } from '@playwright/test';

const ORGANIZER_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || 'test@example.com';
const ORGANIZER_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || 'testpassword123';
const ORGANIZER_SECOND_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL_SECOND || 'test2@example.com';
const ORGANIZER_SECOND_PASSWORD =
  process.env.PLAYWRIGHT_TEST_PASSWORD_SECOND || 'testpassword123';

const TOURNAMENT_DATES = {
  start: '2025-06-01',
  end: '2025-06-03',
};

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/auth');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/dashboard', { timeout: 15000 });
}

async function signOut(page: import('@playwright/test').Page, email: string) {
  await page.getByRole('button', { name: new RegExp(email, 'i') }).click();
  await page.getByRole('menuitem', { name: /logout/i }).click();
  await page.waitForURL('/auth');
}

async function createTournament(page: import('@playwright/test').Page, title: string) {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create tournament/i }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Start Date').fill(TOURNAMENT_DATES.start);
  await page.getByLabel('End Date').fill(TOURNAMENT_DATES.end);
  await page.getByRole('button', { name: /create/i }).click();
  await page.waitForURL(/\/t\/.+\/setup/, { timeout: 15000 });
  await page.goto('/dashboard');
}

test.describe.serial('Auth + authorization regression coverage', () => {
  test('organizers only see their own tournaments on the dashboard', async ({ page }) => {
    const timestamp = Date.now();
    const organizerATitle = `QA Isolation A ${timestamp}`;
    const organizerBTitle = `QA Isolation B ${timestamp}`;

    await signIn(page, ORGANIZER_EMAIL, ORGANIZER_PASSWORD);
    await createTournament(page, organizerATitle);
    await signOut(page, ORGANIZER_EMAIL);

    await signIn(page, ORGANIZER_SECOND_EMAIL, ORGANIZER_SECOND_PASSWORD);
    await createTournament(page, organizerBTitle);

    const organizerBRow = page.getByRole('row', { name: new RegExp(organizerBTitle) });
    await expect(organizerBRow).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(organizerATitle) })).toHaveCount(0);
  });

  test('non-masters are blocked from /admin/tournaments', async ({ page }) => {
    await signIn(page, ORGANIZER_SECOND_EMAIL, ORGANIZER_SECOND_PASSWORD);

    await page.goto('/admin/tournaments');
    await page.waitForURL('/dashboard');
    await expect(page.getByRole('heading', { name: /tournament dashboard/i })).toBeVisible();
  });

  test('auth callback without params shows recovery UI', async ({ page }) => {
    await page.goto('/auth/callback');

    await expect(page.getByRole('heading', { name: /link expired/i })).toBeVisible();
    await expect(
      page.getByText('No authentication data found. The link may have expired or already been used.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /go to sign in/i })).toBeVisible();
  });
});
