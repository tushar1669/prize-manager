import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts/team-prizes-a4', { recursive: true });

for (const size of ['short', 'long'] as const) {
  test(`Team Prizes ${size} A4 PDF retains full winner rows and colored award groups`, async ({ page }) => {
    await page.goto('/qa/team-prizes/' + (size === 'long' ? '?long' : ''));
    await expect(page.locator('.pm-team-prize-group')).toHaveCount(3);
    const count = size === 'long' ? 42 : 12;
    await expect(page.locator('.pm-team-prize-group tbody tr')).toHaveCount(count);
    await expect(page.getByText('EXCLUDED_NEVER_PRINT')).toHaveCount(0);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.pm-team-prize-group thead')).toHaveCount(3);
    const fills = await page.locator('.pm-team-prize-group').evaluateAll(groups => groups.map(group => {
      const cell = group.querySelector('tbody td');
      return cell ? getComputedStyle(cell).backgroundColor : null;
    }));
    expect(fills).toEqual(['rgb(250, 243, 227)', 'rgb(234, 245, 239)', 'rgb(234, 241, 252)']);
    const pdf = await page.pdf({
      path: `artifacts/team-prizes-a4/teams-${size}-a4.pdf`, format: 'A4', printBackground: true,
    });
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    await page.screenshot({ path: `artifacts/team-prizes-a4/teams-${size}-screen.png`, fullPage: true });
  });
}

test('preview access never exposes 1st-placed team winner', async ({ page }) => {
  await page.goto('/qa/team-prizes/?restricted');
  await expect(page.getByText('Locked — upgrade to Pro to reveal this placing')).toHaveCount(3);
  await expect(page.getByText('Synthetic International Chess Academy 1 — Institution 1')).toHaveCount(0);
  await expect(page.getByText('Synthetic International Chess Academy 1 — Institution 2')).toBeVisible();
});

test('organizer-expanded ineligible teams are never present on printed handout', async ({ page }) => {
  await page.goto('/qa/team-prizes/?diagnostics');
  const button = page.getByRole('button', { name: /1 ineligible team/ }).first();
  await button.click();
  await expect(page.getByText('EXCLUDED_NEVER_PRINT').first()).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('EXCLUDED_NEVER_PRINT').first()).toBeHidden();
  await expect(page.locator('.pm-team-prize-group tbody tr')).toHaveCount(12);
});

test('printed Team Prizes headings and all metadata blocks use centered, group-specific styling', async ({ page }) => {
  await page.goto('/qa/team-prizes/');
  await page.emulateMedia({ media: 'print' });
  const groups = page.locator('.pm-team-prize-group');
  await expect(groups).toHaveCount(3);
  const expectedColors = [
    ['rgb(250, 243, 227)', 'rgb(101, 74, 18)'],
    ['rgb(234, 245, 239)', 'rgb(20, 80, 63)'],
    ['rgb(234, 241, 252)', 'rgb(18, 59, 128)'],
  ];
  for (let index = 0; index < 3; index++) {
    const group = groups.nth(index);
    const headers = await group.locator('thead th').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).textAlign));
    expect(headers).toHaveLength(6);
    expect(headers.every(value => value === 'center')).toBe(true);

    const title = group.locator('[data-team-group-header] h3');
    await expect(title).toBeVisible();
    expect(await title.evaluate(node => getComputedStyle(node).textAlign)).toBe('center');

    const badges = group.locator('.pm-team-prize-meta-badge');
    await expect(badges).toHaveCount(4);
    const labels = await badges.allTextContents();
    expect(labels.some(label => label.includes('Grouped by:'))).toBe(true);
    expect(labels.some(label => label.includes('Top 2 players'))).toBe(true);
    expect(labels.some(label => label.includes('eligible team'))).toBe(true);
    expect(labels.some(label => label.includes('winners') || label.includes('winner'))).toBe(true);

    const colors = await badges.evaluateAll(nodes =>
      nodes.map(node => ({
        background: getComputedStyle(node).backgroundColor,
        foreground: getComputedStyle(node).color,
        textAlign: getComputedStyle(node).textAlign,
      })));
    for (const color of colors) {
      expect(color.background).toBe(expectedColors[index][0]);
      expect(color.foreground).toBe(expectedColors[index][1]);
      expect(color.textAlign).toBe('center');
    }
  }
  const globalBadges = page.locator('.pm-team-prizes-overview-badge');
  await expect(globalBadges).toHaveCount(2);
  const globalFills = await globalBadges.evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(globalFills).toEqual(['rgb(250, 243, 227)', 'rgb(250, 243, 227)']);
});
