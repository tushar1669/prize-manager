import { test, expect } from '@playwright/test';

const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || 'testpassword123';

const TOURNAMENT_DATES = {
  start: '2025-06-01',
  end: '2025-06-03',
};

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/auth');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/dashboard', { timeout: 15000 });
}

async function signUp(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/dashboard', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: /tournament dashboard/i })).toBeVisible();
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
    const organizerAEmail = `qa.organizer.a.${timestamp}@example.com`;
    const organizerBEmail = `qa.organizer.b.${timestamp}@example.com`;
    const organizerATitle = `QA Isolation A ${timestamp}`;
    const organizerBTitle = `QA Isolation B ${timestamp}`;

    await signUp(page, organizerAEmail, TEST_PASSWORD);
    await createTournament(page, organizerATitle);
    await signOut(page, organizerAEmail);

    await signUp(page, organizerBEmail, TEST_PASSWORD);
    await createTournament(page, organizerBTitle);

    const organizerBRow = page.getByRole('row', { name: new RegExp(organizerBTitle) });
    await expect(organizerBRow).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(organizerATitle) })).toHaveCount(0);
  });

  test('non-masters are blocked from /admin/tournaments', async ({ page }) => {
    const timestamp = Date.now();
    const organizerEmail = `qa.organizer.admin.${timestamp}@example.com`;

    await signUp(page, organizerEmail, TEST_PASSWORD);

    await page.goto('/admin/tournaments');
    const accessDenied = page.getByText(/access denied/i);
    await Promise.race([
      page.waitForURL('/dashboard', { timeout: 15000 }),
      accessDenied.waitFor({ timeout: 15000 }),
    ]);

    if (page.url().includes('/dashboard')) {
      await expect(page.getByRole('heading', { name: /tournament dashboard/i })).toBeVisible();
    } else {
      await expect(accessDenied).toBeVisible();
    }
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
