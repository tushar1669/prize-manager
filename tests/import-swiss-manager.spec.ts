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

    currentTest(`imports ${fixture.label} with 0 schema errors @swiss`, async ({ page }) => {
      const consoleMessages: string[] = [];
      const consoleErrors: string[] = [];
      
      page.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push(text);
        
        // Capture validation errors
        if (text.includes('[validate]') && text.includes('errors=')) {
          consoleErrors.push(text);
        }
      });

      await page.goto(`/t/${TOURNAMENT_ID}/import`);

      const fileInput = page.locator('input[type="file"]').first();
      await expect(fileInput).toBeVisible();

      await fileInput.setInputFiles(fixture.path);

      // Wait for import to complete
      await expect(page.getByText(/players ready to import/i)).toBeVisible({ timeout: 60000 });

      // Verify validation log exists
      const validateLog = consoleMessages.find((msg) => msg.startsWith('[validate] total='));
      expect(validateLog, `No validation log found for ${fixture.label}`).toBeTruthy();

      // Extract validation counts
      const validMatch = validateLog?.match(/valid=(\d+)/);
      const errorMatch = validateLog?.match(/errors=(\d+)/);
      const validCount = validMatch ? parseInt(validMatch[1], 10) : 0;
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

      // CRITICAL: Verify 0 schema errors
      expect(errorCount, `${fixture.label} has ${errorCount} validation errors`).toBe(0);
      expect(validCount, `${fixture.label} has 0 valid players`).toBeGreaterThan(0);

      // Verify required fields are mapped
      const detectLog = consoleMessages.find((msg) => msg.includes('[detect]'));
      expect(detectLog, `No detection log found for ${fixture.label}`).toBeTruthy();

      // Verify state extraction (if Ident column present)
      const stateExtractLog = consoleMessages.find((msg) => msg.includes('auto-extracted') && msg.includes('state'));
      if (stateExtractLog) {
        console.log(`[test] ${fixture.label}: ${stateExtractLog}`);
      }

      // Verify import log persisted
      const importLogMsg = consoleMessages.find((msg) => msg.startsWith('[import.log] inserted id='));
      expect(importLogMsg, `No import log persisted for ${fixture.label}`).toBeTruthy();

      // Navigate to review and verify no error panels
      await page.getByRole('button', { name: /next: review/i }).click();
      await expect(page).toHaveURL(/\/review/);

      // Verify no critical error panels displayed
      const errorPanel = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
      await expect(errorPanel).toHaveCount(0);

      // Verify player table loaded
      const playerTable = page.locator('table').first();
      await expect(playerTable).toBeVisible();

      // Log summary
      console.log(`[test] ✓ ${fixture.label}: ${validCount} players, 0 errors`);
    });
  }
});
