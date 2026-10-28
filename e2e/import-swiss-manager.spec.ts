import { test, expect } from '@playwright/test';
import { makeXlsxTmp } from './utils/xlsx';
import { assertIsolatedQaBackend } from './utils/qaEnvironment';

// An isolated QA backend and dedicated credentials are required by the preflight.
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL!;
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD!;

const SWISS_HEADERS = [
  'Rank',
  'SNo.',
  'Name',
  'Rtg',
  'IRtg',
  'Birth',
  'fs',
  'Fide-No.',
  'Federation',
  'State',
  'City',
  'Club'
];

type SwissPlayer = {
  rank: number;
  sno: number;
  name: string;
  rating: number;
  initialRating: number;
  birth: string;
  gender: string;
  fideId: string;
  federation: string;
  state: string;
  city: string;
  club: string;
};

const BASE_PLAYERS: SwissPlayer[] = [
  {
    rank: 1,
    sno: 57,
    name: 'Aditi Sharma',
    rating: 1850,
    initialRating: 1780,
    birth: '2007/00/00',
    gender: 'F',
    fideId: '35012345',
    federation: 'IND',
    state: 'MH',
    city: 'Pune',
    club: 'XYZ Chess'
  },
  {
    rank: 12,
    sno: 101,
    name: 'Rohan Iyer',
    rating: 1720,
    initialRating: 0,
    birth: '2005/05/14',
    gender: '',
    fideId: '',
    federation: 'IND',
    state: 'KA',
    city: 'Bengaluru',
    club: ''
  },
  {
    rank: 28,
    sno: 64,
    name: 'Sia Verma',
    rating: 1500,
    initialRating: 1450,
    birth: '2010/09/03',
    gender: 'F',
    fideId: '',
    federation: 'IND',
    state: 'DL',
    city: 'New Delhi',
    club: ''
  }
];

function buildSwissRows(players: SwissPlayer[]) {
  const metadata = [
    ['Swiss-Manager Interim Ranking List'],
    ['Generated via Playwright QA Harness'],
    [''],
    ['Tournament', 'QA Automation Open'],
    ['Round', players.length + 3],
    [''],
    [''],
    SWISS_HEADERS
  ];

  const dataRows = players.map(player => [
    player.rank,
    player.sno,
    player.name,
    player.rating,
    player.initialRating,
    player.birth,
    player.gender,
    player.fideId,
    player.federation,
    player.state,
    player.city,
    player.club
  ]);

  return [...metadata, ...dataRows];
}

function generateSwissFixture(index: number) {
  const offset = index * 2;
  const players = BASE_PLAYERS.map((player, playerIdx) => ({
    ...player,
    rank: player.rank + offset + playerIdx,
    sno: player.sno + offset * 3 + playerIdx,
    name: `${player.name} ${index + 1}`,
    rating: Math.max(0, player.rating - offset),
    initialRating: Math.max(0, player.initialRating - offset),
    fideId: player.fideId ? `${player.fideId}${index}` : '',
    state: player.state || ['MH', 'KA', 'DL', 'GJ'][index % 4],
    city: player.city || ['Pune', 'Bengaluru', 'New Delhi', 'Ahmedabad'][index % 4],
    club: player.club || (index % 2 === 0 ? 'City Chess Club' : '')
  }));

  const label = `sm_${String(index + 1).padStart(2, '0')}.xlsx`;
  const rows = buildSwissRows(players);
  const path = makeXlsxTmp(rows, 'SwissManager', label);

  return { label, path } as const;
}

const swissFixtures = Array.from({ length: 10 }, (_, index) => generateSwissFixture(index));

test.describe('@swiss Swiss-Manager staging suite', () => {
  let tournamentId: string;

  test.beforeAll(async ({ browser }) => {
    // CI previously hit the LIVE Supabase Auth endpoint using placeholder credentials.
    // Never start an authenticated flow until this confirms a separate QA project.
    assertIsolatedQaBackend();
    const page = await browser.newPage();
    try {
      await page.goto('/auth');
      await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
      await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      // Do not auto-sign-up on failed authentication; the QA account must pre-exist.
      await page.waitForURL(/\/dashboard(?:[/?#]|$)/, { timeout: 15000 });

      // Dashboard creates the tournament directly (there is no /tournament-setup route).
      await page.getByRole('button', { name: /create tournament/i }).click();
      await page.waitForURL(/\/t\/[a-f0-9-]+\/setup(?:\?|$)/, { timeout: 15000 });
      const match = page.url().match(/\/t\/([a-f0-9-]+)\/setup/);
      if (!match) throw new Error('QA tournament was not created on the isolated backend');
      tournamentId = match[1];
    } finally {
      await page.close();
    }
  });

  for (const fixture of swissFixtures) {
    test(`imports ${fixture.label} with 0 schema errors @swiss`, async ({ page }) => {
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

      test.skip(!tournamentId, 'Tournament creation failed in beforeAll');

      await page.goto(`/t/${tournamentId}/import`);

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
