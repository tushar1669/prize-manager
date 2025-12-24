import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Trophy, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAwardDisplayClasses, getAwardFlagsForPrizeRow } from '@/utils/prizeAwards';

interface PosterGridViewProps {
  winners: FinalPrizeWinnerRow[];
  tournamentId: string;
}

export function PosterGridView({ winners, tournamentId }: PosterGridViewProps) {
  const publicUrl = `/t/${tournamentId}/public`;
  const shareLink = useMemo(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}${publicUrl}`;
    }
    return publicUrl;
  }, [publicUrl]);

  const gridLayout = 'sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2';

  return (
    <div
      className="poster-grid mx-auto mt-8 max-w-7xl px-6 pb-12 print:mt-3 print:px-0 print:pb-4"
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
        </div>
      </div>
      <div className={`poster-grid-cards grid gap-4 ${gridLayout} print:gap-3`}>
        {winners.map(winner => {
          const awardFlags = getAwardFlagsForPrizeRow(winner);
          const trophyDisplay = getAwardDisplayClasses('trophy');
          const medalDisplay = getAwardDisplayClasses('medal');
          const metaItems = [
            typeof winner.rank === 'number' && winner.rank > 0 ? `Rank ${winner.rank}` : null,
            winner.state ? `State ${winner.state}` : null,
            winner.club ? `Club ${winner.club}` : null,
          ].filter(Boolean);
          const metaSummary = metaItems.length > 0 ? metaItems.join(' • ') : '—';

          return (
            <div
              key={winner.prizeId}
              className="poster-grid-card pm-print-avoid-break flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-lg print:border-black/30 print:bg-white print:p-3 print:shadow-none"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 text-sm font-semibold text-foreground print:text-xs print:text-black">
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                    Category
                  </span>
                  <Badge className="rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground print:border print:border-black print:bg-white print:px-2 print:py-0.5 print:text-xs print:text-black">
                    {winner.categoryName}
                  </Badge>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                    Place
                  </span>
                  <span className="inline-flex rounded-full bg-success/10 px-3 py-1 text-success print:border print:border-black/40 print:bg-white print:px-2 print:py-0.5 print:text-black">
                    #{winner.place}
                  </span>
                </div>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-foreground print:text-xl print:text-black">
                {winner.playerName}
              </div>
              <div className="text-xs font-medium text-muted-foreground print:text-[10px] print:text-black/70">
                {metaSummary}
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 text-base font-semibold text-foreground print:text-sm print:text-black">
                <span className="rounded-full bg-primary/10 px-4 py-1 text-primary print:border print:border-black/40 print:bg-white print:px-2 print:py-0.5 print:text-black">
                  {formatCurrencyINR(winner.amount)}
                </span>
                {(awardFlags.hasTrophy || awardFlags.hasMedal) && (
                  <span className="inline-flex items-center gap-2 print:text-black">
                    {awardFlags.hasTrophy && (
                      <span className={`inline-flex items-center gap-1 ${trophyDisplay.iconClass}`}>
                        <Trophy className="h-5 w-5" aria-hidden />
                        <span className="sr-only">{trophyDisplay.label}</span>
                      </span>
                    )}
                    {awardFlags.hasMedal && (
                      <span className={`inline-flex items-center gap-1 ${medalDisplay.iconClass}`}>
                        <Medal className="h-5 w-5" aria-hidden />
                        <span className="sr-only">{medalDisplay.label}</span>
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
