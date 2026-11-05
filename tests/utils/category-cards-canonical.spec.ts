import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

// Owner decision, 4 Nov 2026: on Finalize and Final Prize the screen shows the 28 Oct
// Category Cards (CategoryCardsView); CategoryCardsUpdatedView stays their print design.
// Public pages keep CategoryCardsUpdatedView on screen. One "Category Cards" tab (v6).
function expectScreenPrintPair(page: string) {
  const updated = page.indexOf('<CategoryCardsUpdatedView');
  const legacy = page.indexOf('<CategoryCardsView');
  expect(updated).toBeGreaterThan(-1);
  // The screen cards come after the print design, so the print DOM keeps its order.
  expect(legacy).toBeGreaterThan(updated);
  expect(page.match(/<CategoryCardsView\b/g)).toHaveLength(1);
  expect(page.match(/<CategoryCardsUpdatedView\b/g)).toHaveLength(1);
}

describe('Category Cards: one tab; 28 Oct cards on organizer screens, updated design in print and public', () => {
  it('Finalize: one Category Cards tab; screen and print renderers paired, no old tab', () => {
    const page = read('src/pages/Finalize.tsx');
    expect(page).toContain("useState<FinalViewTab>('v6')");
    expect(page).toContain('<TabsTrigger value="v6"');
    expect(page).toContain('>Category Cards</TabsTrigger>');
    expect(page).not.toContain('Category Cards — Updated');
    expect(page).not.toContain('<TabsTrigger value="v1"');
    expect(page).not.toContain('<TabsContent value="v1"');
    expectScreenPrintPair(page);
  });

  it('Final Prize: keeps direct links compatible by redirecting v1 to v6; renderers paired', () => {
    const page = read('src/pages/FinalPrizeView.tsx');
    expect(page).toContain("id: 'v6', label: 'Category Cards'");
    expect(page).not.toContain('Category Cards — Updated');
    expect(page).toContain('if (view === \'v1\')');
    expect(page).toContain('final/v6');
    expect(page).not.toContain("id: 'v1', label:");
    expect(page).not.toContain('<TabsContent value="v1"');
    expectScreenPrintPair(page);
  });

  it('the 28 Oct cards never print, and the updated view is hidden only on organizer screens', () => {
    const legacy = read('src/components/final-prize/CategoryCardsView.tsx');
    expect(legacy).toContain('max-w-6xl flex-col gap-6 px-6 pb-12 print:hidden');
    const css = read('src/components/final-prize/CategoryCardsUpdatedView.css');
    expect(css).toMatch(/@media screen \{\s*\.pm-print-surface \.pm-category-cards-updated \{ display: none; \}\s*\}/);
  });

  it('routes the post-publish print shortcut to the single canonical view', () => {
    const page = read('src/pages/PublishSuccess.tsx');
    expect(page).toContain('/final/v6');
    expect(page).not.toContain('/final/v1');
  });

  it('uses the updated category layout on screen in published-only public displays', () => {
    const details = read('src/pages/PublicTournamentDetails.tsx');
    const winners = read('src/pages/PublicWinnersPage.tsx');
    for (const page of [details, winners]) {
      expect(page).toContain('<CategoryCardsUpdatedView');
      expect(page).not.toContain('CategoryCardsView');
      expect(page).not.toContain('pm-print-surface');
    }
    // Unchanged public access relies on the published-only selector and pinned version.
    expect(details).toContain('usePublishedAllocationVersion');
    expect(winners).toContain('usePublishedAllocationVersion');
    expect(winners).toContain('>Category Cards</TabsTrigger>');
    expect(winners).not.toContain('Category Cards — Updated');
  });
});
