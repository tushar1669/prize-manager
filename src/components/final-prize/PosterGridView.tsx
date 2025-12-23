import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Trophy, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getAwardFlagsForPrizeRow } from '@/utils/prizeAwards';

interface PosterGridViewProps {
  winners: FinalPrizeWinnerRow[];
  tournamentId: string;
}

export function PosterGridView({ winners, tournamentId }: PosterGridViewProps) {
  const publicUrl = `/t/${tournamentId}/public`;
  const [posterSize, setPosterSize] = useState<'a4' | 'a3'>('a4');
  const shareLink = useMemo(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}${publicUrl}`;
    }
    return publicUrl;
  }, [publicUrl]);

  const gridLayout = posterSize === 'a3'
    ? 'sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3'
    : 'sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2';

  return (
    <div
      className="poster-grid mx-auto mt-8 max-w-7xl px-6 pb-12 print:mt-3 print:px-0 print:pb-4"
      data-poster-size={posterSize}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:mb-3 print:hidden">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">Champions Board</h2>
          <p className="text-sm text-muted-foreground">Display near the venue entrance or results desk.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-sm font-medium text-muted-foreground print:inline">Set printer to borderless if available.</div>
          <Badge variant="outline" className="rounded-full border-success text-success">
            Scan to view live updates
          </Badge>
          <div className="flex rounded-full border border-border bg-card p-1 shadow-sm">
            <Button
              type="button"
              size="sm"
              variant={posterSize === 'a4' ? 'default' : 'ghost'}
              aria-pressed={posterSize === 'a4'}
              className={`rounded-full ${posterSize === 'a4' ? 'bg-primary text-primary-foreground hover:bg-primary-hover' : ''}`}
              onClick={() => setPosterSize('a4')}
            >
              A4
            </Button>
            <Button
              type="button"
              size="sm"
              variant={posterSize === 'a3' ? 'default' : 'ghost'}
              aria-pressed={posterSize === 'a3'}
              className={`rounded-full ${posterSize === 'a3' ? 'bg-primary text-primary-foreground hover:bg-primary-hover' : ''}`}
              onClick={() => setPosterSize('a3')}
            >
              A3
            </Button>
          </div>
        </div>
      </div>
      <div className={`poster-grid-cards grid gap-4 ${gridLayout} print:gap-3`}>
        {winners.map(winner => {
          const awardFlags = getAwardFlagsForPrizeRow(winner);

          return (
            <div
              key={winner.prizeId}
              className="poster-grid-card pm-print-avoid-break flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-lg print:border-black/30 print:bg-white print:p-3 print:shadow-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground print:text-xs print:text-black">
                <Badge className="rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground print:border print:border-black print:bg-white print:px-2 print:py-0.5 print:text-xs print:text-black">
                  {winner.categoryName}
                </Badge>
                <span className="rounded-full bg-success/10 px-3 py-1 text-success print:border print:border-black/40 print:bg-white print:px-2 print:py-0.5 print:text-black">
                  Prize Place {winner.place}
                </span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-foreground print:text-xl print:text-black">
                {winner.playerName}
              </div>
              <div className="flex items-center justify-between gap-3 text-base font-semibold text-foreground print:text-sm print:text-black">
                <span className="rounded-full bg-primary/10 px-4 py-1 text-primary print:border print:border-black/40 print:bg-white print:px-2 print:py-0.5 print:text-black">
                  {formatCurrencyINR(winner.amount)}
                </span>
                {(awardFlags.hasTrophy || awardFlags.hasMedal) && (
                  <span className="inline-flex items-center gap-2 text-primary print:text-black">
                    {awardFlags.hasTrophy && (
                      <span className="inline-flex items-center gap-1">
                        <Trophy className="h-5 w-5" aria-hidden />
                        <span className="sr-only">Trophy</span>
                      </span>
                    )}
                    {awardFlags.hasMedal && (
                      <span className="inline-flex items-center gap-1">
                        <Medal className="h-5 w-5" aria-hidden />
                        <span className="sr-only">Medal</span>
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 grid gap-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm text-foreground sm:grid-cols-[minmax(5rem,7rem)_1fr] print:hidden">
        <div className="flex h-24 items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-card text-xs font-semibold uppercase tracking-wide text-primary">
          QR Code
        </div>
        <div className="flex flex-col justify-center gap-1">
          <span className="text-sm font-semibold">Scan for live updates</span>
          <Link
            to={publicUrl}
            className="break-all text-xs underline decoration-primary decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success"
          >
            {shareLink}
          </Link>
        </div>
      </div>
    </div>
  );
}
