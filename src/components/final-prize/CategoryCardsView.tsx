import { Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Trophy, Medal } from 'lucide-react';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';

interface CategoryCardsViewProps {
  categories: {
    id: string;
    name: string;
    is_main: boolean;
  }[];
  byCategory: Map<string, FinalPrizeWinnerRow[]>;
}

const glyphByPlace = (place: number) => {
  if (place === 1) return <Trophy className="h-4 w-4 text-[#6B46C1]" aria-hidden />;
  if (place === 2) return <Medal className="h-4 w-4 text-[#10B981]" aria-hidden />;
  if (place === 3) return <Medal className="h-4 w-4 text-[#6B46C1]" aria-hidden />;
  return null;
};

export function CategoryCardsView({ categories, byCategory }: CategoryCardsViewProps) {
  return (
    <div className="mx-auto mt-8 grid max-w-7xl gap-6 px-6 pb-12 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
      {categories.map(category => {
        const winners = byCategory.get(category.id) || [];
        if (winners.length === 0) return null;

        return (
          <Card
            key={category.id}
            className="flex flex-col rounded-3xl border border-border/60 bg-white/90 shadow-lg shadow-[#6B46C1]/5 print:shadow-none"
          >
            <CardHeader className="flex flex-col gap-2 rounded-t-3xl bg-gradient-to-r from-[#6B46C1]/10 via-background to-[#10B981]/10 pb-4">
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="font-semibold text-[#2D1B69]">{category.name}</span>
                {category.is_main && <Badge className="rounded-full bg-[#6B46C1] text-white">Main</Badge>}
              </CardTitle>
              <div className="text-sm text-muted-foreground">{winners.length} placements</div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 py-4">
              {winners.map((winner, index) => (
                <Fragment key={winner.prizeId}>
                  {index > 0 && <Separator className="bg-border/60" />}
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6B46C1]/10 text-base font-semibold text-[#6B46C1]">
                      {winner.place}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                        {glyphByPlace(winner.place)}
                        <span>{winner.playerName}</span>
                        {winner.state && (
                          <Badge variant="secondary" className="rounded-full bg-[#10B981]/10 text-xs text-[#065f46]">
                            {winner.state}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {winner.club ? `${winner.club} • ` : ''}#{winner.sno ?? '—'} • Rank {winner.rank ?? '—'}
                      </div>
                    </div>
                    <div className="text-right text-base font-semibold text-[#10B981]">
                      {formatCurrencyINR(winner.amount)}
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
