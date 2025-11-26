import { Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
    <div className="mx-auto mt-8 grid max-w-7xl gap-6 px-6 pb-12 sm:grid-cols-2 xl:grid-cols-3 print:mt-3 print:grid-cols-2 print:gap-4 print:px-0 print:pb-4">
      {groups.map(({ category, winners }) => {
        if (winners.length === 0) return null;

        return (
          <Card
            key={category.id}
            data-category-card
            className="pm-print-avoid-break flex flex-col rounded-lg border border-border bg-card shadow-lg print:border print:border-black/30 print:bg-white print:shadow-none"
          >
            <CardHeader className="flex flex-col gap-2 rounded-t-lg bg-gradient-to-r from-primary/10 via-card to-success/10 pb-4 print:bg-white print:pb-1.5">
              <CardTitle className="flex items-center justify-between text-xl print:text-base">
                <span className="font-bold text-foreground print:text-black">{category.name}</span>
                {category.is_main && <Badge className="rounded-full bg-primary text-primary-foreground print:border print:border-black print:bg-white print:text-black print:text-xs">Main</Badge>}
              </CardTitle>
              <div className="text-sm text-muted-foreground print:text-xs print:text-black/70">{winners.length} placements</div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5 py-5 print:gap-2.5 print:py-2.5">
              {winners.map((winner, index) => (
                <Fragment key={winner.prizeId}>
                  {index > 0 && <Separator className="bg-border print:bg-black/20" />}
                  <div className="flex items-start gap-4 print:gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary print:h-7 print:w-7 print:text-sm print:text-black">
                      {winner.place}
                    </div>
                    <div className="flex-1 space-y-1.5 print:space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground print:gap-1 print:text-sm print:text-black">
                        {glyphByPlace(winner.place)}
                        <span>{winner.playerName}</span>
                        {winner.state && (
                          <Badge variant="secondary" className="rounded-full bg-success/10 text-xs text-success border-success/20 print:border print:border-black/40 print:bg-white print:text-[10px] print:text-black">
                            {winner.state}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground print:text-[10px] print:text-black/60">
                        {winner.club ? `${winner.club} • ` : ''}#{winner.sno ?? '—'} • Rank {winner.rank ?? '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <span className="inline-flex items-center rounded-full border border-success/50 bg-success/10 px-4 py-1.5 text-base font-bold text-success print:border-black/50 print:bg-white print:px-2 print:py-0.5 print:text-sm print:text-black">
                        {formatCurrencyINR(winner.amount)}
                      </span>
                    </div>
                  </div>
                </Fragment>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
