import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SWISS_DIR = path.resolve(__dirname, 'fixtures', 'swiss');
const TOURNAMENT_ID = process.env.PLAYWRIGHT_IMPORT_TOURNAMENT_ID;

const swissFixtures = Array.from({ length: 10 }, (_, idx) => {
  const baseName = `sm_${String(idx + 1).padStart(2, '0')}`;
  const xlsPath = path.join(SWISS_DIR, `${baseName}.xls`);
  const xlsxPath = path.join(SWISS_DIR, `${baseName}.xlsx`);

  if (fs.existsSync(xlsPath)) {
    return { label: `${baseName}.xls`, path: xlsPath, exists: true } as const;
  }

  if (fs.existsSync(xlsxPath)) {
    return { label: `${baseName}.xlsx`, path: xlsxPath, exists: true } as const;
  }

  return { label: `${baseName}.xls`, path: xlsPath, exists: false } as const;
});

test.describe('@swiss Swiss-Manager staging suite', () => {
  test.skip(!TOURNAMENT_ID, 'PLAYWRIGHT_IMPORT_TOURNAMENT_ID not configured');

  for (const fixture of swissFixtures) {
    const currentTest = fixture.exists ? test : test.skip;

    currentTest(`imports ${fixture.label} @swiss`, async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await page.goto(`/t/${TOURNAMENT_ID}/import`);

      const fileInput = page.locator('input[type="file"]').first();
      await expect(fileInput).toBeVisible();

      await fileInput.setInputFiles(fixture.path);

      await expect(page.getByText(/players ready to import/i)).toBeVisible({ timeout: 60000 });

      await page.getByRole('button', { name: /next: review/i }).click();
      await expect(page).toHaveURL(/\/review/);

      expect(consoleMessages.some((msg) => msg.startsWith('[validate] total='))).toBeTruthy();
      expect(consoleMessages.some((msg) => msg.startsWith('[import.log] inserted id='))).toBeTruthy();
    });
  }
});
