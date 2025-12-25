import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FIXTURE = path.resolve(__dirname, 'fixtures', 'import', 'valid-template.xlsx');
const CONFIGURED_FIXTURE = process.env.PLAYWRIGHT_IMPORT_FIXTURE
  ? path.resolve(process.env.PLAYWRIGHT_IMPORT_FIXTURE)
  : DEFAULT_FIXTURE;
const HAS_FIXTURE = fs.existsSync(CONFIGURED_FIXTURE);
const TOURNAMENT_ID = process.env.PLAYWRIGHT_IMPORT_TOURNAMENT_ID;

test.describe('Import logs staging smoke', () => {
  test.skip(!TOURNAMENT_ID || !HAS_FIXTURE, 'Import logs staging prerequisites missing');

  test('records a log entry after a successful import', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    await page.goto(`/t/${TOURNAMENT_ID}/import`);

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();

    await fileInput.setInputFiles(CONFIGURED_FIXTURE);

    await expect(page.getByText(/players ready to import/i)).toBeVisible({ timeout: 60000 });

    await page.getByRole('button', { name: /next: review/i }).click();
    await expect(page).toHaveURL(/\/review/);

    await page.goto(`/t/${TOURNAMENT_ID}/import`);

    const firstLogRow = page.getByTestId('import-log-row').first();
    await expect(firstLogRow).toBeVisible({ timeout: 60000 });

    expect(consoleMessages.some((msg) => msg.startsWith('[import.log] inserted id='))).toBeTruthy();
    expect(consoleMessages.some((msg) => msg.startsWith('[import.log] fetch count='))).toBeTruthy();
  });
});
