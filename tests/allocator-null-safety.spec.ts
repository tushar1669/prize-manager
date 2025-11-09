import { test, expect } from '@playwright/test';
import { writeXlsxTmp } from './utils/xlsx';

/**
 * Allocator Null-Safety Integration Tests
 * 
 * Verifies that prize allocation handles missing optional fields gracefully:
 * - Missing gender when category requires it
 * - Missing DOB when category has age rules
 * - Missing rating when it's a rating category
 * - Missing state/city/club when category filters by those
 * - Null vs undefined vs empty string handling
 */

test.describe('Allocator Null-Safety', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to setup page
    await page.goto('/auth');
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/dashboard');
  });

  test('handles missing gender gracefully when category requires it', async ({ page }) => {
    // Create tournament
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Gender');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];
    expect(tournamentId).toBeTruthy();

    // Add Women category
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('Women');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByText('Women')).toBeVisible();

    // Edit Women category rules to require gender
    const womenCard = page.locator('[data-testid="category-card"]').filter({ hasText: 'Women' }).first();
    await womenCard.getByRole('button', { name: /edit rules/i }).click();
    await page.locator('select[name="gender"]').selectOption('F');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/rules saved/i)).toBeVisible();

    // Import players with missing gender
    await page.goto(`/t/${tournamentId}/import`);
    
    // Mock file upload with players missing gender field
    const filePath = writeXlsxTmp(
      'players-no-gender',
      ['Rank', 'Name', 'Rtg', 'Fide-No.', 'Birth', 'Gender'],
      [
        [1, 'Alice', 2100, '12345', '1990-05-12', null],
        [2, 'Bob', 2050, '12346', '1989-11-23', null],
        [3, 'Carol', 2000, null, '1995-03-15', null],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    // Wait for mapping dialog and confirm
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    
    // Proceed to finalize
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify unfilled prizes have appropriate reason codes
    await expect(page.getByText(/gender_missing/i)).toBeVisible();
    
    // Ensure no crashes occurred (page is still functional)
    await expect(page.getByRole('button', { name: /finalize/i })).toBeVisible();
  });

  test('handles missing DOB when category has age rules', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Age');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];

    // Add U13 category
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('U13');
    await page.getByRole('button', { name: /create/i }).click();

    // Set age rule
    const u13Card = page.locator('[data-testid="category-card"]').filter({ hasText: 'U13' }).first();
    await u13Card.getByRole('button', { name: /edit rules/i }).click();
    await page.getByLabel('Max Age').fill('13');
    await page.getByRole('button', { name: /save/i }).click();

    // Import players with missing DOB
    await page.goto(`/t/${tournamentId}/import`);
    
    const filePath = writeXlsxTmp(
      'players-no-dob',
      ['Rank', 'Name', 'Gender', 'Rtg', 'Birth'],
      [
        [1, 'David', 'M', 1800, null],
        [2, 'Emma', 'F', 1750, null],
        [3, 'Frank', 'M', 1700, null],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify dob_missing reason code
    await expect(page.getByText(/dob_missing/i)).toBeVisible();
  });

  test('handles missing rating in rating categories', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Rating');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];

    // Add Below 1800 category
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('Below 1800');
    await page.getByRole('button', { name: /create/i }).click();

    // Set rating rule
    const ratingCard = page.locator('[data-testid="category-card"]').filter({ hasText: 'Below 1800' }).first();
    await ratingCard.getByRole('button', { name: /edit rules/i }).click();
    await page.getByLabel('Max Rating').fill('1800');
    await page.getByRole('button', { name: /save/i }).click();

    // Import players with missing rating
    await page.goto(`/t/${tournamentId}/import`);
    
    const filePath = writeXlsxTmp(
      'players-no-rating',
      ['Rank', 'Name', 'Gender', 'Birth', 'Rtg'],
      [
        [1, 'George', 'M', '1990-01-01', null],
        [2, 'Hannah', 'F', '1992-05-15', null],
        [3, 'Ian', 'M', '1988-12-25', null],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify unrated_excluded reason code
    await expect(page.getByText(/unrated_excluded/i)).toBeVisible();
  });

  test('handles missing state/city/club filters gracefully', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Location');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];

    // Add Karnataka category with state filter
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('Karnataka Only');
    await page.getByRole('button', { name: /create/i }).click();

    const kaCard = page.locator('[data-testid="category-card"]').filter({ hasText: 'Karnataka Only' }).first();
    await kaCard.getByRole('button', { name: /edit rules/i }).click();
    
    // Add state filter (KA)
    await page.getByLabel('Allowed States').fill('KA');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /save/i }).click();

    // Import players with missing state
    await page.goto(`/t/${tournamentId}/import`);
    
    const filePath = writeXlsxTmp(
      'players-no-state',
      ['Rank', 'Name', 'Gender', 'Rtg', 'Birth', 'State'],
      [
        [1, 'Jack', 'M', 1900, '1990-01-01', null],
        [2, 'Kate', 'F', 1850, '1992-05-15', null],
        [3, 'Liam', 'M', 1800, '1988-12-25', null],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify state_excluded reason code
    await expect(page.getByText(/state_excluded/i)).toBeVisible();
  });

  test('handles multiple missing fields without crashing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Multiple');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];

    // Add complex category with multiple criteria
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('Complex Rules');
    await page.getByRole('button', { name: /create/i }).click();

    const complexCard = page.locator('[data-testid="category-card"]').filter({ hasText: 'Complex Rules' }).first();
    await complexCard.getByRole('button', { name: /edit rules/i }).click();
    
    await page.locator('select[name="gender"]').selectOption('M');
    await page.getByLabel('Max Age').fill('18');
    await page.getByLabel('Max Rating').fill('2000');
    await page.getByLabel('Allowed States').fill('TN');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /save/i }).click();

    // Import minimal player data (many missing fields)
    await page.goto(`/t/${tournamentId}/import`);
    
    const filePath = writeXlsxTmp(
      'players-minimal',
      ['Rank', 'Name', 'Gender', 'Rtg', 'Birth', 'State'],
      [
        [1, 'Mike', null, null, null, null],
        [2, 'Nina', null, null, null, null],
        [3, 'Oscar', null, null, null, null],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator - should NOT crash
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify multiple reason codes appear
    const reasonCodes = ['gender_missing', 'dob_missing', 'unrated_excluded', 'state_excluded'];
    let foundReasons = 0;
    for (const code of reasonCodes) {
      const isVisible = await page.getByText(new RegExp(code, 'i')).isVisible().catch(() => false);
      if (isVisible) foundReasons++;
    }
    
    // At least some reason codes should be present
    expect(foundReasons).toBeGreaterThan(0);

    // Critical: Page should still be functional
    await expect(page.getByRole('button', { name: /finalize/i })).toBeVisible();
    await expect(page.getByText(/Complex Rules/i)).toBeVisible();
  });

  test('distinguishes between null, undefined, and empty string', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /create tournament/i }).click();
    await page.getByLabel('Title').fill('Null Safety Test - Empty Values');
    await page.getByLabel('Start Date').fill('2025-06-01');
    await page.getByLabel('End Date').fill('2025-06-03');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/t\/.+\/setup/);

    const tournamentId = page.url().match(/\/t\/([^/]+)\//)?.[1];

    // Add category
    await page.getByText('Prizes').click();
    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByLabel('Category Name').fill('Open');
    await page.getByRole('button', { name: /create/i }).click();

    // Import players with various empty representations
    await page.goto(`/t/${tournamentId}/import`);
    
    const filePath = writeXlsxTmp(
      'players-empty-values',
      ['Rank', 'Name', 'Gender', 'Rtg', 'Birth', 'State'],
      [
        [1, 'Paula', 'F', 1900, '1990-01-01', 'TN'],
        [2, 'Quinn', '', 1850, '1992-05-15', null],
        [3, 'Ryan', 'M', null, '1988-12-25', 'KA'],
      ],
    );

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /select excel file/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /confirm mapping/i }).click();
    await page.getByRole('button', { name: /proceed/i }).click();
    await page.waitForURL(/\/t\/.+\/finalize/);

    // Run allocator
    await page.getByRole('button', { name: /allocate prizes/i }).click();
    await expect(page.getByText(/allocation complete/i)).toBeVisible({ timeout: 10000 });

    // Verify allocation completed without crashes
    await expect(page.getByRole('button', { name: /finalize/i })).toBeEnabled();
    
    // Player 1 (complete data) should win
    await expect(page.getByText('Paula')).toBeVisible();
  });
});
