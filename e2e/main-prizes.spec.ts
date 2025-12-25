import { test, expect } from '@playwright/test';

test.describe('Main Prizes Hydration', () => {
  test('loads from DB and avoids false restore', async ({ page }) => {
    // Navigate to tournament setup
    await page.goto('/t/TEST_TOURNAMENT_ID/setup');
    await page.getByText('Prizes').click();

    // Wait for prize rows to load from DB
    await page.waitForSelector('[data-testid="prize-row"]', { timeout: 5000 });
    
    // Should NOT show a "restore draft" banner
    await expect(page.getByText(/restore draft/i)).toHaveCount(0);

    // Edit the first cash input
    const firstCashInput = page.locator('input[type="number"]').first();
    await firstCashInput.fill('5000');

    // Save prizes
    await page.getByRole('button', { name: /save prizes/i }).click();
    await expect(page.getByText(/prizes saved/i)).toBeVisible({ timeout: 3000 });

    // Reload and verify
    await page.reload();
    await page.getByText('Prizes').click();

    // Should NOT show false "restore draft" banner
    await expect(page.getByText(/restore draft/i)).toHaveCount(0);
    
    // Value should persist
    await expect(page.locator('input[type="number"]').first()).toHaveValue('5000');
  });
});
