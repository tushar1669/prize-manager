import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const fixture = '/qa-fixtures/category-cards-v6.html';

async function load(page: import('@playwright/test').Page, scenario: string) {
  await page.goto(`${fixture}?scenario=${scenario}`);
  await expect(page.locator('#qa-updated .pmv6-category')).toHaveCount(scenario === 'long' ? 1 : 3);
}

test('real React component preserves normal winner names, places and cash from v1', async ({ page }) => {
  await load(page, 'normal');
  const namesV6 = await page.locator('#qa-updated .pmv6-name').allTextContents();
  const namesV1 = await page.locator('#qa-legacy [data-category-card] tbody tr td:nth-child(2) .font-semibold').allTextContents();
  expect(namesV6).toEqual(namesV1);
  expect(namesV6).toHaveLength(10);
  const amountsV6 = await page.locator('#qa-updated .pmv6-amount').allTextContents();
  const amountsV1 = await page.locator('#qa-legacy [data-category-card] tbody tr td:nth-child(4)').allTextContents();
  expect(amountsV6).toEqual(amountsV1);
  const placeV6 = await page.locator('#qa-updated .pmv6-place').allTextContents();
  const placeV1 = await page.locator('#qa-legacy [data-category-card] tbody tr td:first-child').allTextContents();
  expect(placeV6).toEqual(placeV1);
  expect(await page.locator('#qa-updated table.pmv6-table--gift').count()).toBe(2);
});

test('preview masks non-main categories and limits Main exactly as v1', async ({ page }) => {
  await load(page, 'preview');
  const namesV6 = await page.locator('#qa-updated .pmv6-name').allTextContents();
  const namesV1 = await page.locator('#qa-legacy [data-category-card] tbody tr td:nth-child(2) .font-semibold').allTextContents();
  expect(namesV6).toEqual(namesV1);
  expect(namesV6).toHaveLength(2);
  await expect(page.locator('#qa-updated .pmv6-locked')).toHaveCount(2);
  await expect(page.locator('#qa-updated .pmv6-locked-note')).toContainText('4 more prizes hidden');
  expect(await page.locator('#qa-updated .pmv6-locked').allTextContents()).not.toContain('Player-003');
});

test('real print output has a repeated footer, correct A4 dimensions and all 90 winners', async ({ page }) => {
  await load(page, 'long');
  await expect(page.locator('#qa-updated .pmv6-name')).toHaveCount(90);
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  mkdirSync('qa-output', { recursive: true });
  writeFileSync('qa-output/category-v6-long.pdf', pdf);
  const info = execFileSync('pdfinfo', ['-'], { input: pdf, encoding: 'utf8' });
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  expect(pages).toBeGreaterThan(1);
  const dimensions = info.match(/Page size:\s+([0-9.]+) x ([0-9.]+) pts/i);
  expect(dimensions).not.toBeNull();
  expect(Math.abs(Number(dimensions![1]) - 595)).toBeLessThan(0.2);
  expect(Math.abs(Number(dimensions![2]) - 842)).toBeLessThan(0.2);
  const printed = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' });
  for (let i=1; i<=90; i++) {
    expect(printed).toContain(`Player-${String(i).padStart(3,'0')}`);
  }
  const footerCount = (printed.match(/DERA Tech/g)||[]).length;
  expect(footerCount).toBe(pages);
  for (let i=1; i<=pages; i++) expect(printed).toContain(`Page ${i} / ${pages}`);
  const imageList = execFileSync('pdfimages', ['-list', '-'], { input: pdf, encoding: 'utf8' });
  const imagePages = imageList.split('\n')
    .slice(2)
    .filter(line => /^\s*\d+\s+\d+\s+image\s/.test(line))
    .map(line => Number(line.trim().split(/\s+/)[0]));
  expect(new Set(imagePages)).toEqual(new Set(Array.from({ length: pages }, (_, i) => i + 1)));
  // A 1221px-wide logo should print at roughly 34mm, not at its unscaled 96ppi size.
  const imageDpi = imageList.split('\n').slice(2)
    .filter(line => /^\s*\d+\s+\d+\s+image\s/.test(line))
    .map(line => Number(line.trim().split(/\s+/)[12]));
  expect(imageDpi.every(dpi => dpi >= 800 && dpi <= 1200)).toBe(true);

  const boxes = execFileSync('pdftotext', ['-bbox', '-', '-'], { input: pdf, encoding: 'utf8' });
  const words = [...boxes.matchAll(/<word xMin="([0-9.]+)" yMin="([0-9.]+)" xMax="([0-9.]+)" yMax="([0-9.]+)"/g)];
  expect(words.length).toBeGreaterThan(90);
  for (const word of words) {
    expect(Number(word[1])).toBeGreaterThanOrEqual(0);
    expect(Number(word[3])).toBeLessThanOrEqual(595.2);
    expect(Number(word[2])).toBeGreaterThanOrEqual(0);
    expect(Number(word[4])).toBeLessThanOrEqual(842.2);
  }

  console.log(`REAL_V6_LONG_PDF: ${pages} A4 pages, 90 names, ${footerCount} footers`);
});

test('no-gift variant prints without gift column and distinct category colors', async ({ page }) => {
  await load(page, 'no-gift');
  expect(await page.locator('#qa-updated .pmv6-table--gift').count()).toBe(0);
  await page.emulateMedia({ media: 'print' });
  const colors = await page.locator('#qa-updated .pmv6-category').evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node).borderTopColor)
  );
  expect(new Set(colors).size).toBeGreaterThanOrEqual(2);
  const pdf = await page.pdf({ format:'A4', preferCSSPageSize:true, printBackground:true });
  mkdirSync('qa-output', { recursive: true });
  writeFileSync('qa-output/category-v6-no-gift.pdf', pdf);
  const text = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' });
  expect(text).toContain('Main Prizes');
  expect(text).toContain('Under-12 Girls');
  expect(text).toContain('Under-16 Open');
  const info = execFileSync('pdfinfo', ['-'], { input: pdf, encoding: 'utf8' });
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  const images = execFileSync('pdfimages', ['-list', '-'], { input: pdf, encoding: 'utf8' });
  const imagePages = images.split('\n').slice(2)
    .filter(line => /^\s*\d+\s+\d+\s+image\s/.test(line))
    .map(line => Number(line.trim().split(/\s+/)[0]));
  expect(new Set(imagePages)).toEqual(new Set(Array.from({ length: pages }, (_, i) => i + 1)));

});
