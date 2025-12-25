import { test, expect } from '@playwright/test';

// NOTE: This scenario assumes seeded data and a crafted Excel workbook to trigger conflicts.
test.describe('Player import conflict review', () => {
  test('review panel surfaces conflicts and allows export', async ({ page }) => {
    test.skip(true, 'Requires seeded tournament data and conflict Excel fixture');

    await page.goto('/t/demo/import');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select Excel File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('tests/fixtures/import-conflicts.xlsx');

    await expect(page.getByRole('heading', { name: /Conflict Review/i })).toBeVisible();
    await expect(page.getByText(/FIDE ID Conflicts/i)).toBeVisible();
    await expect(page.getByText(/Name \+ DOB Conflicts/i)).toBeVisible();

    const keepB = page.locator('input[value="keepB"]');
    await keepB.first().check();

    await page.getByRole('button', { name: /Prefer richest row/i }).click();
    await expect(page.locator('input[value="merge"]')).not.toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download Conflicts Excel/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});
