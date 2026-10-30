import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('one canonical Category Cards layout across prize views', () => {
  it('defaults Finalize to the approved updated layout with no old tab or renderer', () => {
    const page = read('src/pages/Finalize.tsx');
    expect(page).toContain("useState<FinalViewTab>('v6')");
    expect(page).toContain('<TabsTrigger value="v6"');
    expect(page).toContain('>Category Cards</TabsTrigger>');
    expect(page).not.toContain('Category Cards — Updated');
    expect(page).toContain('<CategoryCardsUpdatedView');
    expect(page).not.toContain('<TabsTrigger value="v1"');
    expect(page).not.toContain('<TabsContent value="v1"');
    expect(page).not.toContain('CategoryCardsView');
  });

  it('keeps direct Final Prize links compatible by redirecting v1 to v6', () => {
    const page = read('src/pages/FinalPrizeView.tsx');
    expect(page).toContain("id: 'v6', label: 'Category Cards'");
    expect(page).not.toContain('Category Cards — Updated');
    expect(page).toContain('if (view === \'v1\')');
    expect(page).toContain('<CategoryCardsUpdatedView');
    expect(page).toContain('final/v6');
    expect(page).not.toContain("id: 'v1', label:");
    expect(page).not.toContain('<TabsContent value="v1"');
    expect(page).not.toContain('CategoryCardsView');
  });

  it('routes the post-publish print shortcut to the single canonical view', () => {
    const page = read('src/pages/PublishSuccess.tsx');
    expect(page).toContain('/final/v6');
    expect(page).not.toContain('/final/v1');
  });

  it('uses the approved category layout also in published-only public displays', () => {
    const details = read('src/pages/PublicTournamentDetails.tsx');
    const winners = read('src/pages/PublicWinnersPage.tsx');
    for (const page of [details, winners]) {
      expect(page).toContain('<CategoryCardsUpdatedView');
      expect(page).not.toContain('CategoryCardsView');
    }
    // Unchanged public access relies on the published-only selector and pinned version.
    expect(details).toContain('usePublishedAllocationVersion');
    expect(winners).toContain('usePublishedAllocationVersion');
    expect(winners).toContain('>Category Cards</TabsTrigger>');
    expect(winners).not.toContain('Category Cards — Updated');
  });
});
