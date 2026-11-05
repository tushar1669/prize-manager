import { expect, test } from '@playwright/test';

/**
 * Opt-in browser-print regression against an authorized, synthetic, full-access
 * fixture tournament. This test NEVER creates tournaments or touches production.
 *
 * Fixture requirements: at least 12 allocated synthetic individual winners across
 * at least 2 categories; long winner names, gift items, trophies and medals;
 * a logged-in organizer with full tournament export access.
 *
 * Run with PLAYWRIGHT_FINAL_PRIZE_FIXTURE_ID,
 * PLAYWRIGHT_FINAL_PRIZE_FIXTURE_NAMES (two or more distinct synthetic names
 * separated by |), PLAYWRIGHT_FINAL_PRIZE_FIXTURE_GIFT_LABEL, and
 * PLAYWRIGHT_FINAL_PRIZE_FIXTURE_STORAGE_STATE set to a local Playwright auth
 * storage-state file. No real participant data or credentials may be committed.
 *
 * When fixture data is unavailable this suite reports SKIPPED, never PASSED.
 * Playwright's PDF attachments require human page-break inspection before signoff.
 */
const tournamentId = process.env.PLAYWRIGHT_FINAL_PRIZE_FIXTURE_ID ?? '';
const names = (process.env.PLAYWRIGHT_FINAL_PRIZE_FIXTURE_NAMES ?? '')
  .split('|').map(name => name.trim()).filter(Boolean);
const giftLabel = process.env.PLAYWRIGHT_FINAL_PRIZE_FIXTURE_GIFT_LABEL ?? '';
const storageState = process.env.PLAYWRIGHT_FINAL_PRIZE_FIXTURE_STORAGE_STATE ?? '';
const fixtureReady = Boolean(tournamentId && names.length >= 2 && giftLabel && storageState);

test.describe('Final Prize A4 PDF — synthetic fixture @fexp-print', () => {
  test.skip(!fixtureReady, 'No authorized synthetic full-access tournament + browser auth fixture configured');
  test.use({ storageState: storageState || { cookies: [], origins: [] } });

  for (const view of ['v1', 'v3', 'v4'] as const) {
    test(`prints final view ${view} with long names, awards and no toolbar`, async ({ page }) => {
      await page.goto(`/t/${tournamentId}/final/${view}`);
      const surface = page.locator('.pm-print-surface');
      await expect(surface).toBeVisible();
      for (const name of names) {
        await expect(surface).toContainText(name);
      }
      await expect(surface).toContainText(giftLabel);

      if (view === 'v1') {
        await expect(page.locator('[data-category-card="true"]').first()).toBeVisible();
      } else if (view === 'v3') {
        await expect(page.locator('.poster-grid-card').first()).toBeVisible();
      } else {
        await expect(surface.locator('table tbody tr').first()).toBeVisible();
      }

      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.pm-print-hide')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeHidden();
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
      await test.info().attach(`fexp-${view}-a4.pdf`, {
        body: pdf,
        contentType: 'application/pdf',
      });
    });
  }
});
