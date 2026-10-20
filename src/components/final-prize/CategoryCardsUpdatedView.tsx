import { CategoryCardsView } from './CategoryCardsView';
import type { FinalPrizeCategoryGroup } from '@/hooks/useFinalPrizeData';
import './CategoryCardsUpdatedView.css';

interface CategoryCardsUpdatedViewProps {
  groups: FinalPrizeCategoryGroup[];
  hasFullAccess?: boolean;
  previewMainLimit?: number;
}

/**
 * Opt-in presentation of the existing category card data.
 * Keep CategoryCardsView intact as the legacy v1 implementation.
 */
export function CategoryCardsUpdatedView(props: CategoryCardsUpdatedViewProps) {
  return (
    <section className="pm-category-cards-updated" aria-label="Category Cards Updated">
      <CategoryCardsView {...props} />
    </section>
  );
}
