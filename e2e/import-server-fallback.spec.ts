import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const TOURNAMENT_ID = process.env.PLAYWRIGHT_IMPORT_TOURNAMENT_ID;

const LARGE_BUFFER = Buffer.alloc(4 * 1024 * 1024, 0);

const serverResponse = {
  sheetName: 'Players',
  headerRow: 1,
  headers: ['Rank', 'Name', 'Rating', 'DOB'],
  rows: [
    { Rank: 1, Name: 'Test Player', Rating: 2000, DOB: '2000-01-01' }
  ],
  fileHash: 'abc123',
  rowCount: 1,
  source: 'organizer-template',
  durationMs: 12
};

test.describe('server import fallback', () => {
  test.skip(!TOURNAMENT_ID, 'PLAYWRIGHT_IMPORT_TOURNAMENT_ID not configured');

  test('chooses server path for large file uploads', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    await page.route('**/parseWorkbook', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(serverResponse)
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/t/${TOURNAMENT_ID}/import`);

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();

    await fileInput.setInputFiles({
      name: 'large.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: LARGE_BUFFER
    });

    await expect(page.getByText(/Players ready to import/i)).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Parsed on server for speed\/reliability/i)).toBeVisible();

    expect(consoleMessages.some((msg) => msg.includes('[import.source] chosen=server'))).toBeTruthy();
  });
});
