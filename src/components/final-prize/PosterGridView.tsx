import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      className="poster-grid mx-auto mt-8 max-w-7xl px-6 pb-12"
      data-poster-size={posterSize}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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
      <div className={`grid gap-4 ${gridLayout}`}>
        {winners.map(winner => (
          <div
            key={winner.prizeId}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-lg print:shadow-none"
          >
            <Badge className="w-fit rounded-full bg-primary px-3 py-1 text-sm text-primary-foreground">
              {winner.categoryName}
            </Badge>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {winner.playerName}
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span className="rounded-full bg-success/10 px-3 py-1 text-success">Place {winner.place}</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                {formatCurrencyINR(winner.amount)}
              </span>
              {winner.state && <span className="rounded-full bg-muted px-3 py-1">{winner.state}</span>}
            </div>
            <div className="text-base text-muted-foreground">
              {winner.club || 'Club TBC'} • Rank {winner.rank ?? '—'}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm text-foreground sm:grid-cols-[minmax(5rem,7rem)_1fr]">
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
