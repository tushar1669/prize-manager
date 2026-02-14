import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Medal, Trophy, Lock } from 'lucide-react';
import { FinalPrizeCategoryGroup } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { getAwardDisplayClasses, getAwardFlagsForPrizeRow, stripAwardMarkers } from '@/utils/prizeAwards';
import { Skeleton } from '@/components/ui/skeleton';

interface CategoryCardsViewProps {
  groups: FinalPrizeCategoryGroup[];
  hasFullAccess?: boolean;
  previewMainLimit?: number;
}

function LockedCategoryCard({ categoryName }: { categoryName: string }) {
  return (
    <Card className="relative w-full rounded-lg border border-dashed border-border bg-muted/50 shadow-sm overflow-hidden">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
        <Lock className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-muted-foreground">Upgrade to Pro to view</p>
      </div>
      <CardHeader className="opacity-30 pointer-events-none">
        <CardTitle className="text-xl">
          <span className="font-bold text-foreground">{categoryName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-5 pt-0 opacity-0 pointer-events-none">
        <div className="h-24" />
      </CardContent>
    </Card>
  );
}

function SkeletonRow() {
  return (
    <tr className="align-top">
      <td className="py-2 pr-3"><Skeleton className="h-4 w-8" /></td>
      <td className="py-2 pr-3"><Skeleton className="h-4 w-32" /></td>
      <td className="py-2 pr-3"><Skeleton className="h-4 w-10" /></td>
      <td className="py-2 pr-3"><Skeleton className="h-4 w-16" /></td>
      <td className="py-2 pr-3 text-center"><Skeleton className="h-4 w-6 mx-auto" /></td>
      <td className="py-2 text-center"><Skeleton className="h-4 w-6 mx-auto" /></td>
    </tr>
  );
}

export function CategoryCardsView({ groups, hasFullAccess = true, previewMainLimit = 8 }: CategoryCardsViewProps) {
  const nonEmptyGroups = groups.filter(g => g.winners.length > 0);

  return (
    <div className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 print:mt-0 print:gap-0 print:px-0 print:pb-0">
      {nonEmptyGroups.map(({ category, winners }, printIndex) => {
        // If locked and not main, show locked card
        if (!hasFullAccess && !category.is_main) {
          return <LockedCategoryCard key={category.id} categoryName={category.name} />;
        }

        // For main category when locked, limit visible rows
        const visibleWinners = (!hasFullAccess && category.is_main)
          ? winners.slice(0, previewMainLimit)
          : winners;
        const lockedCount = (!hasFullAccess && category.is_main)
          ? Math.max(0, winners.length - previewMainLimit)
          : 0;

        return (
          <Card
            key={category.id}
            data-category-card="true"
            data-print-index={printIndex}
            className="pm-print-avoid-break w-full rounded-lg border border-border bg-card shadow-lg print:border print:border-black/30 print:bg-white print:shadow-none"
          >
            <CardHeader className="flex flex-col gap-2 rounded-t-lg bg-gradient-to-r from-primary/10 via-card to-success/10 pb-4 print:bg-white print:pb-1.5">
              <CardTitle className="flex items-center justify-between text-xl print:text-base">
                <span className="font-bold text-foreground print:text-black">{category.name}</span>
                {category.is_main && <Badge className="rounded-full bg-primary text-primary-foreground print:border print:border-black print:bg-white print:text-black print:text-xs">Main</Badge>}
              </CardTitle>
              <div className="text-sm text-muted-foreground print:text-xs print:text-black/70">{winners.length} placements</div>
            </CardHeader>
            <CardContent className="pb-5 pt-0 print:pb-2.5">
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse text-sm print:text-[10px]">
                  <thead className="bg-muted/30 print:bg-white">
                    <tr className="text-left">
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Prize Place</th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Player Name</th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Rank</th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Amount</th>
                      <th className="py-2 pr-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Trophy</th>
                      <th className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">Medal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 print:divide-black/20">
                    {visibleWinners.map(winner => {
                      const awardFlags = getAwardFlagsForPrizeRow(winner);
                      const trophyDisplay = getAwardDisplayClasses('trophy');
                      const medalDisplay = getAwardDisplayClasses('medal');
                      const playerName = stripAwardMarkers(winner.playerName);

                      return (
                        <tr key={winner.prizeId} className="align-top">
                          <td className="py-2 pr-3 font-semibold text-foreground print:text-black">{winner.place}</td>
                          <td className="py-2 pr-3">
                            <div className="space-y-0.5">
                              <div className="font-semibold text-foreground print:text-black">{playerName}</div>
                              {(() => {
                                const metaParts = [winner.club, winner.state].map(part => part?.toString().trim()).filter(Boolean);
                                if (metaParts.length === 0) return null;
                                return (
                                  <div className="text-xs text-muted-foreground print:text-[9px] print:text-black/60">
                                    {metaParts.join(' • ')}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground print:text-black">{winner.rank ?? '—'}</td>
                          <td className="py-2 pr-3 font-semibold text-success print:text-black">{formatCurrencyINR(winner.amount)}</td>
                          <td className="py-2 pr-3 text-center">
                            {awardFlags.hasTrophy ? (
                              <span className={`inline-flex items-center justify-center ${trophyDisplay.iconClass}`}>
                                <Trophy className="h-4 w-4 print:hidden" aria-hidden />
                                <span className={`hidden text-[9px] font-semibold uppercase tracking-wide print:inline ${trophyDisplay.labelClass}`}>{trophyDisplay.label}</span>
                                <span className="sr-only">{trophyDisplay.label}</span>
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-center">
                            {awardFlags.hasMedal ? (
                              <span className={`inline-flex items-center justify-center ${medalDisplay.iconClass}`}>
                                <Medal className="h-4 w-4 print:hidden" aria-hidden />
                                <span className={`hidden text-[9px] font-semibold uppercase tracking-wide print:inline ${medalDisplay.labelClass}`}>{medalDisplay.label}</span>
                                <span className="sr-only">{medalDisplay.label}</span>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {lockedCount > 0 && Array.from({ length: Math.min(lockedCount, 4) }).map((_, i) => (
                      <SkeletonRow key={`locked-${i}`} />
                    ))}
                  </tbody>
                </table>
                {lockedCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>{lockedCount} more prize{lockedCount > 1 ? 's' : ''} hidden. Upgrade to Pro to view all results.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
