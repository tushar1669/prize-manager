import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Trophy, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getAwardDisplayClasses, getAwardFlagsForPrizeRow } from '@/utils/prizeAwards';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface PosterGridViewProps {
  winners: FinalPrizeWinnerRow[];
  tournamentId: string;
}

type PosterGridPrintMode = 'compact' | 'one-per-page';

export function PosterGridView({ winners, tournamentId }: PosterGridViewProps) {
  const publicUrl = `/t/${tournamentId}/public`;
  const [printMode, setPrintMode] = useState<PosterGridPrintMode>('compact');
  const shareLink = useMemo(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return `${window.location.origin}${publicUrl}`;
    }
    return publicUrl;
  }, [publicUrl]);

  const gridLayout = 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div
      className="poster-grid pm-poster-grid mx-auto mt-8 max-w-7xl px-6 pb-12 print:mt-3 print:px-0 print:pb-4"
      data-print-mode={printMode}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:mb-3 print:hidden">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">Champions Board</h2>
          <p className="text-sm text-muted-foreground">Display near the venue entrance or results desk.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="hidden text-sm font-medium text-muted-foreground print:inline">Set printer to borderless if available.</div>
          <Badge variant="outline" className="rounded-full border-success text-success">
            Scan to view live updates
          </Badge>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground print:hidden">
            <span>Print layout</span>
            <ToggleGroup
              type="single"
              value={printMode}
              onValueChange={value => {
                if (value) setPrintMode(value as PosterGridPrintMode);
              }}
              size="sm"
              className="border border-border rounded-md bg-card p-1"
            >
              <ToggleGroupItem value="compact" aria-label="Compact print layout">
                Compact
              </ToggleGroupItem>
              <ToggleGroupItem value="one-per-page" aria-label="One category per page">
                One per page
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      <div className={`poster-grid-cards grid gap-4 ${gridLayout} print:gap-3`}>
        {winners.map((winner, index) => {
          const awardFlags = getAwardFlagsForPrizeRow(winner);
          const trophyDisplay = getAwardDisplayClasses('trophy');
          const medalDisplay = getAwardDisplayClasses('medal');

          return (
            <div
              key={winner.prizeId}
              data-print-index={index}
              className="poster-grid-card pm-print-avoid-break flex flex-col rounded-xl border border-border bg-card p-6 shadow-lg print:rounded-lg print:border-black/30 print:bg-white print:p-4 print:shadow-none"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4 print:border-black/30 print:pb-2">
                <Badge className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground print:border print:border-black print:bg-white print:px-2 print:py-0.5 print:text-xs print:text-black">
                  {winner.categoryName}
                </Badge>
                <span className="rounded-full bg-success/15 px-4 py-1.5 text-base font-bold text-success print:border print:border-black/40 print:bg-white print:px-2 print:py-0.5 print:text-sm print:text-black">
                  #{winner.place}
                </span>
              </div>

              <div className="poster-grid-name border-b border-border/60 py-4 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl print:border-black/30 print:py-2 print:text-xl print:text-black">
                {winner.playerName}
              </div>

              <div className="flex items-center justify-between gap-3 pt-4 print:pt-2">
                <span className="rounded-full bg-primary/10 px-5 py-1.5 text-lg font-bold text-primary print:border print:border-black/40 print:bg-white print:px-3 print:py-1 print:text-sm print:text-black">
                  {formatCurrencyINR(winner.amount)}
                </span>
                {(awardFlags.hasTrophy || awardFlags.hasMedal) && (
                  <span className="inline-flex items-center gap-2 print:text-black">
                    {awardFlags.hasTrophy && (
                      <span className={`inline-flex items-center ${trophyDisplay.iconClass}`}>
                        <Trophy className="h-6 w-6" aria-hidden />
                        <span className="sr-only">{trophyDisplay.label}</span>
                      </span>
                    )}
                    {awardFlags.hasMedal && (
                      <span className={`inline-flex items-center ${medalDisplay.iconClass}`}>
                        <Medal className="h-6 w-6" aria-hidden />
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
