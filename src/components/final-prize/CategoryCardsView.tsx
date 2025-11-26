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
    <div className="mx-auto mt-8 grid max-w-7xl gap-6 px-6 pb-12 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
      {groups.map(({ category, winners }) => {
        if (winners.length === 0) return null;

        return (
          <Card
            key={category.id}
            className="flex flex-col rounded-lg border border-border bg-card shadow-lg print:border-muted-foreground/40 print:bg-white print:shadow-none"
          >
            <CardHeader className="flex flex-col gap-2 rounded-t-lg bg-gradient-to-r from-primary/10 via-card to-success/10 pb-4 print:bg-white print:pb-2">
              <CardTitle className="flex items-center justify-between text-xl">
                <span className="font-bold text-foreground">{category.name}</span>
                {category.is_main && <Badge className="rounded-full bg-primary text-primary-foreground">Main</Badge>}
              </CardTitle>
              <div className="text-sm text-muted-foreground">{winners.length} placements</div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5 py-5 print:py-3">
              {winners.map((winner, index) => (
                <Fragment key={winner.prizeId}>
                  {index > 0 && <Separator className="bg-border" />}
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {winner.place}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
                        {glyphByPlace(winner.place)}
                        <span>{winner.playerName}</span>
                        {winner.state && (
                          <Badge variant="secondary" className="rounded-full bg-success/10 text-xs text-success border-success/20">
                            {winner.state}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {winner.club ? `${winner.club} • ` : ''}#{winner.sno ?? '—'} • Rank {winner.rank ?? '—'}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <span className="inline-flex items-center rounded-full border border-success/50 bg-success/10 px-4 py-1.5 text-base font-bold text-success print:border-success/60 print:bg-white">
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
