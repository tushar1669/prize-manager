import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal } from 'lucide-react';
import { FinalPrizeCategoryGroup } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';

interface CategoryCardsViewProps {
  groups: FinalPrizeCategoryGroup[];
}

const glyphByPlace = (place: number) => {
  if (place === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-accent">
        <Trophy className="h-5 w-5" aria-hidden />
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-accent print:inline">Trophy</span>
        <span className="sr-only">Trophy</span>
      </span>
    );
  }
  if (place === 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Medal className="h-5 w-5" aria-hidden />
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-success print:inline">Medal</span>
        <span className="sr-only">Medal</span>
      </span>
    );
  }
  if (place === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 text-secondary">
        <Medal className="h-5 w-5" aria-hidden />
        <span className="hidden text-xs font-semibold uppercase tracking-wide text-secondary print:inline">Medal</span>
        <span className="sr-only">Medal</span>
      </span>
    );
  }
  return null;
};

export function CategoryCardsView({ groups }: CategoryCardsViewProps) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6 px-6 pb-12 print:mt-3 print:gap-4 print:px-0 print:pb-4">
      {groups.map(({ category, winners }) => {
        if (winners.length === 0) return null;

        return (
          <Card
            key={category.id}
            data-category-card
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
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Prize Place
                      </th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Player Name
                      </th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Rank
                      </th>
                      <th className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Amount
                      </th>
                      <th className="py-2 pr-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Trophy
                      </th>
                      <th className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-[10px] print:text-black">
                        Medal
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 print:divide-black/20">
                    {winners.map(winner => (
                      <tr key={winner.prizeId} className="align-top">
                        <td className="py-2 pr-3 font-semibold text-foreground print:text-black">{winner.place}</td>
                        <td className="py-2 pr-3">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground print:gap-1 print:text-black">
                              {glyphByPlace(winner.place)}
                              <span>{winner.playerName}</span>
                              {winner.state && (
                                <Badge variant="secondary" className="rounded-full border-success/20 bg-success/10 text-xs text-success print:border print:border-black/40 print:bg-white print:text-[9px] print:text-black">
                                  {winner.state}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground print:text-[9px] print:text-black/60">
                              {winner.club ? `${winner.club} • ` : ''}#{winner.sno ?? '—'}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground print:text-black">{winner.rank ?? '—'}</td>
                        <td className="py-2 pr-3 font-semibold text-success print:text-black">{formatCurrencyINR(winner.amount)}</td>
                        <td className="py-2 pr-3 text-center">
                          {winner.place === 1 ? (
                            <span className="inline-flex items-center justify-center text-accent">
                              <Trophy className="h-4 w-4 print:hidden" aria-hidden />
                              <span className="hidden text-[9px] font-semibold uppercase tracking-wide text-accent print:inline">Trophy</span>
                              <span className="sr-only">Trophy</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground print:text-black/40">—</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {winner.place === 2 || winner.place === 3 ? (
                            <span className="inline-flex items-center justify-center text-secondary">
                              <Medal className="h-4 w-4 print:hidden" aria-hidden />
                              <span className="hidden text-[9px] font-semibold uppercase tracking-wide text-secondary print:inline">Medal</span>
                              <span className="sr-only">Medal</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground print:text-black/40">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
