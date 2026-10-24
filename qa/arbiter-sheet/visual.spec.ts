import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const dir = 'artifacts/arbiter-a4';
mkdirSync(dir, { recursive: true });

for (const size of ['short', 'long'] as const) {
  test(`real ArbiterSheetView ${size} printable A4 with every signature`, async ({ page }) => {
    const count = size === 'long' ? 42 : 12;
    await page.goto(`/qa/arbiter-sheet/?size=${size}`);
    await expect(page.locator('.pm-arbiter-row')).toHaveCount(count);
    await expect(page.locator('.pm-arbiter-sign-box')).toHaveCount(count);
    await expect(page.locator('.pm-arbiter-row--main')).not.toHaveCount(0);
    await expect(page.locator('.pm-arbiter-row--teal')).not.toHaveCount(0);
    await expect(page.locator('.pm-arbiter-row--navy')).not.toHaveCount(0);
    await expect(page.locator('.pm-arbiter-gift').first()).toContainText('Synthetic Chess Board');
    await page.screenshot({ path: `${dir}/arbiter-${size}-screen.png`, fullPage: true });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.pm-print-hide')).toBeHidden();
    await expect(page.locator('.pm-arbiter-thead')).toBeVisible();
    expect(await page.locator('.pm-arbiter-row').count()).toBe(count);
    await page.pdf({ path: `${dir}/arbiter-${size}-a4.pdf`, format: 'A4', printBackground: true });
  });
}
test('gift column disappears only if all gifts are absent', async ({ page }) => {
  await page.goto('/qa/arbiter-sheet/?gift=none');
  await expect(page.locator('.pm-arbiter-row')).toHaveCount(12);
  await expect(page.getByRole('columnheader', { name: 'Gift' })).toHaveCount(0);
});
test('restricted view never shows synthetic winners or sign-off table', async ({ page }) => {
  await page.goto('/qa/arbiter-sheet/?access=restricted');
  await expect(page.getByText('Arbiter Sheet — Pro Only')).toBeVisible();
  await expect(page.locator('.pm-arbiter-row')).toHaveCount(0);
});
