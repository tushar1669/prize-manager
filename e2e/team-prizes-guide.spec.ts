import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const guidePath = '/guides/team-prizes-organizer-guide-2026-10.pdf';

test('Team Prizes instructions and real PDF asset are public @smoke', async ({ page, request }) => {
  await page.goto('/how-it-works');

  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team Prizes', exact: true })).toBeVisible();
  await expect(page.getByText(/School header.*Team field.*Club.*Club field/i)).toBeVisible();
  await expect(page.getByText(/separate minimum roster-size setting is not yet available/i)).toBeVisible();
  await expect(page.getByText(/Resolve Tie and Save Resolution screenshots were not/i)).toBeVisible();

  const download = page.getByRole('link', { name: 'Download Team Prizes Organizer Guide (PDF)' });
  await expect(download).toHaveAttribute('href', guidePath);
  await expect(download).toHaveAttribute('download', 'Prize-Manager-Team-Prizes-Organizer-Guide.pdf');

  const response = await request.get(guidePath);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^application\/pdf\b/i);
  const body = await response.body();
  expect(body.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  expect(body.length).toBe(724857);
  expect(createHash('sha256').update(body).digest('hex')).toBe('6129f0ed1fa6e5d5508da31be7743929d9758ed3387044eef64ba844b1fdef11');
});

test('Team Prizes footer anchor works at narrow mobile width @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/pricing');
  await page.getByRole('link', { name: 'Team Prizes', exact: true }).click();

  await expect(page).toHaveURL(/\/how-it-works#team-prizes$/);
  const heading = page.getByRole('heading', { name: 'Team Prizes', exact: true });
  await expect(heading).toBeVisible();
  await expect.poll(() => heading.evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(640);
  await expect(page.getByRole('link', { name: 'Download Team Prizes Organizer Guide (PDF)' })).toBeVisible();
});

test('Team Prizes PDF downloads via keyboard at 320px @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/how-it-works#team-prizes');

  const link = page.getByRole('link', { name: 'Download Team Prizes Organizer Guide (PDF)' });
  await expect(link).toBeVisible();

  // A narrow device must not require horizontal scrolling to reach the download.
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(320);

  await link.focus();
  await expect(link).toBeFocused();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Enter'),
  ]);
  expect(download.suggestedFilename()).toBe('Prize-Manager-Team-Prizes-Organizer-Guide.pdf');
  expect(await download.failure()).toBeNull();
});
