import { test, expect } from '@playwright/test';

test.describe('Category Rules Round-Trip', () => {
  test('rules persist after reload', async ({ page }) => {
    // Navigate to tournament setup
    await page.goto('/t/TEST_TOURNAMENT_ID/setup');
    await page.getByText('Prizes').click();

    // Find a non-main category card (e.g., U13)
    const card = page.locator('[data-testid="category-card"]').filter({ hasText: 'U13' }).first();
    await card.getByRole('button', { name: /edit rules/i }).click();

    // Dialog should be visible
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill in age criteria (adjust selector as needed for your form structure)
    await page.locator('input[name="max_age"]').fill('13');

    // Save rules
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/rules saved/i)).toBeVisible({ timeout: 3000 });

    // Reload and verify rules persist
    await page.reload();
    await page.getByText('Prizes').click();
    await card.getByRole('button', { name: /edit rules/i }).click();
    await expect(page.locator('input[name="max_age"]')).toHaveValue('13');
  });
});
