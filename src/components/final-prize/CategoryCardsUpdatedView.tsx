import { Lock } from 'lucide-react';
import type { FinalPrizeCategoryGroup } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { getAwardFlagsForPrizeRow, stripAwardMarkers } from '@/utils/prizeAwards';
import { formatGiftItems } from '@/utils/giftItems';
import './CategoryCardsUpdatedView.css';

interface CategoryCardsUpdatedViewProps {
  groups: FinalPrizeCategoryGroup[];
  hasFullAccess?: boolean;
  previewMainLimit?: number;
}

export function CategoryCardsUpdatedView({
  groups,
  hasFullAccess = true,
  previewMainLimit = 8,
}: CategoryCardsUpdatedViewProps) {
  const nonEmptyGroups = groups.filter(group => group.winners.length > 0);

  return (
    <section className="pm-category-cards-updated" aria-label="Category Cards Updated">
      <div className="pmv6-intro">
        <span className="pmv6-intro-label">Category prize list</span>
        <span className="pmv6-brand">Prize-Manager.com</span>
      </div>
      {nonEmptyGroups.map(({ category, winners }, index) => {
        const isLockedCategory = !hasFullAccess && !category.is_main;
        const visibleWinners = (!hasFullAccess && category.is_main)
          ? winners.slice(0, previewMainLimit)
          : winners;
        const lockedCount = (!hasFullAccess && category.is_main)
          ? Math.max(0, winners.length - previewMainLimit)
          : 0;
        const showGiftColumn = visibleWinners.some(
          winner => formatGiftItems(winner.giftItems).length > 0
        );
        const numberOfColumns = showGiftColumn ? 7 : 6;
        const tone = category.is_main
          ? 'main'
          : (index % 3 === 1 ? 'teal' : index % 3 === 2 ? 'violet' : 'blue');

        return (
          <article
            key={category.id}
            className={`pmv6-category pmv6-category--${tone}`}
            data-v6-category-card="true"
          >
            <header className="pmv6-category-head">
              <span className="pmv6-category-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="pmv6-category-titles">
                <div className="pmv6-category-kicker">
                  {category.is_main ? 'Main prize category' : 'Category prize'}
                  {' · '}{index + 1} of {nonEmptyGroups.length}
                </div>
                <h2 className="pmv6-category-name">{category.name}</h2>
              </div>
              <span className="pmv6-category-count">
                {isLockedCategory ? 'Locked' : `${winners.length} placements`}
              </span>
            </header>

            {isLockedCategory ? (
              <div className="pmv6-locked">
                <Lock size={16} aria-hidden="true" />
                <span>Upgrade to Pro to view</span>
                <div className="pmv6-locked-fill" aria-hidden="true" />
                <div className="pmv6-locked-fill" aria-hidden="true" />
              </div>
            ) : (
              <>
                <div className="pmv6-table-wrap">
                  <table className={`pmv6-table ${showGiftColumn ? 'pmv6-table--gift' : ''}`}>
                    <thead>
                      <tr className="pmv6-table-context">
                        <th colSpan={numberOfColumns} scope="colgroup">
                          {category.name} · Winner details
                        </th>
                      </tr>
                      <tr className="pmv6-table-head">
                        <th scope="col">Place</th>
                        <th scope="col">Player name</th>
                        <th scope="col">Rank</th>
                        <th scope="col">Cash prize</th>
                        {showGiftColumn && <th scope="col">Gift</th>}
                        <th scope="col">Trophy</th>
                        <th scope="col">Medal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleWinners.map(winner => {
                        const flags = getAwardFlagsForPrizeRow(winner);
                        const metaParts = [winner.club, winner.state]
                          .map(part => part?.toString().trim())
                          .filter(Boolean);
                        const giftText = formatGiftItems(winner.giftItems);
                        return (
                          <tr key={winner.prizeId}>
                            <td><span className="pmv6-place">{winner.place}</span></td>
                            <td>
                              <div className="pmv6-name">{stripAwardMarkers(winner.playerName)}</div>
                              {metaParts.length > 0 && (
                                <div className="pmv6-meta">{metaParts.join(' · ')}</div>
                              )}
                            </td>
                            <td className="pmv6-rank">{winner.rank ?? '—'}</td>
                            <td className="pmv6-amount">{formatCurrencyINR(winner.amount)}</td>
                            {showGiftColumn && <td>{giftText || '—'}</td>}
                            <td><span className="pmv6-award">{flags.hasTrophy ? 'Trophy' : '—'}</span></td>
                            <td><span className="pmv6-award">{flags.hasMedal ? 'Medal' : '—'}</span></td>
                          </tr>
                        );
                      })}
                      {lockedCount > 0 && Array.from({ length: Math.min(lockedCount, 4) }).map((_, i) => (
                        <tr key={`locked-${i}`} className="pmv6-masked-row">
                          <td colSpan={numberOfColumns}><div className="pmv6-locked-fill" aria-hidden="true" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lockedCount > 0 && (
                  <p className="pmv6-locked-note">
                    <Lock size={14} aria-hidden="true" />
                    {lockedCount} more prize{lockedCount === 1 ? '' : 's'} hidden. Upgrade to Pro to view all results.
                  </p>
                )}
                <footer className="pmv6-foot">
                  <span>Prize list · Category {index + 1}</span>
                  <span>Generated with Prize-Manager.com</span>
                </footer>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
