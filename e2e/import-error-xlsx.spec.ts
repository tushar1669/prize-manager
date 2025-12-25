import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const TOURNAMENT_ID = process.env.PLAYWRIGHT_IMPORT_TOURNAMENT_ID;
const ERROR_FIXTURE = process.env.PLAYWRIGHT_IMPORT_ERROR_FIXTURE;
const CLEAN_FIXTURE = process.env.PLAYWRIGHT_IMPORT_CLEAN_FIXTURE;

const importPath = (tournamentId: string) => `/t/${tournamentId}/import`;

test.describe('@import-error error export workflow', () => {
  test.skip(!TOURNAMENT_ID, 'PLAYWRIGHT_IMPORT_TOURNAMENT_ID not configured');

  test('downloads Error Excel when validation errors exist', async ({ page }) => {
    test.skip(!ERROR_FIXTURE, 'PLAYWRIGHT_IMPORT_ERROR_FIXTURE not configured');
    test.skip(ERROR_FIXTURE && !fs.existsSync(ERROR_FIXTURE), `Fixture not found at ${ERROR_FIXTURE}`);

    await page.goto(importPath(TOURNAMENT_ID!));

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();

    await fileInput.setInputFiles(ERROR_FIXTURE!);

    const downloadButton = page.getByRole('button', { name: /Download Error Excel/i });
    await expect(downloadButton).toBeVisible({ timeout: 60000 });
    await expect(downloadButton).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/errors_.*\.xlsx$/i);
    const filePath = await download.path();
    expect(filePath).not.toBeNull();
  });

  test('keeps the error export disabled when no validation errors exist', async ({ page }) => {
    test.skip(!CLEAN_FIXTURE, 'PLAYWRIGHT_IMPORT_CLEAN_FIXTURE not configured');
    test.skip(CLEAN_FIXTURE && !fs.existsSync(CLEAN_FIXTURE), `Fixture not found at ${CLEAN_FIXTURE}`);

    await page.goto(importPath(TOURNAMENT_ID!));

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();

    await fileInput.setInputFiles(CLEAN_FIXTURE!);

    await expect(page.getByText(/players validated/i)).toBeVisible({ timeout: 60000 });

    const downloadButton = page.getByRole('button', { name: /Download Error Excel/i });
    await expect(downloadButton).toHaveCount(0);
  });
});
