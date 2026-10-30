import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('artifacts/server-print-a4', { recursive: true });

for (const length of ['short', 'long'] as const) {
  test('Edge printable HTML ' + length + ' uses complete approved A4 team report', async ({ page }) => {
    await page.goto('/qa/server-report/' + (length === 'long' ? '?long' : ''));
    const groups = page.locator('.pm-team-group');
    await expect(groups).toHaveCount(3);
    const count = length === 'short' ? 12 : 42;
    await expect(page.locator('.pm-team-table tbody tr')).toHaveCount(count);
    await expect(page.locator('.pm-team-table thead th')).toHaveCount(12);
    for (const group of await groups.all()) {
      await expect(group.locator('thead th')).toHaveText(['Place', 'Institution', 'Points', 'Prize']);
      await expect(group.locator('tbody tr').first()).toContainText('Fixture Player');
    }
    await page.emulateMedia({ media: 'print' });
    const fills = await groups.evaluateAll(list =>
      list.map(x => getComputedStyle(x.querySelector('tbody td')!).backgroundColor));
    expect(fills).toEqual(['rgb(250, 243, 227)', 'rgb(234, 245, 239)', 'rgb(234, 241, 252)']);
    const aligned = await page.locator('.pm-team-table thead th').evaluateAll(list =>
      list.every(x => getComputedStyle(x).textAlign === 'center'));
    expect(aligned).toBe(true);
    const cssPage = await page.evaluate(() => Array.from(document.styleSheets).some(sheet => {
      try { return Array.from(sheet.cssRules).some(rule => rule.cssText.includes('size: a4')); }
      catch { return false; }
    }));
    expect(cssPage).toBe(true);
    const pdf = await page.pdf({ path: 'artifacts/server-print-a4/' + length + '-server-report.pdf', format: 'A4', printBackground: true });
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await page.screenshot({ path: 'artifacts/server-print-a4/' + length + '-server-report.png', fullPage: true });
  });
}
test('server report only contains saved synthetic team winners, not ineligible diagnostics', async ({ page }) => {
  await page.goto('/qa/server-report/');
  await expect(page.locator('.pm-team-table tbody tr')).toHaveCount(12);
  await expect(page.getByText('Fixture Player', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('unqualified-other-institution')).toHaveCount(0);
  await expect(page.getByText('Rank Sum')).toHaveCount(0);
  await expect(page.getByText('Best Rank')).toHaveCount(0);
});
