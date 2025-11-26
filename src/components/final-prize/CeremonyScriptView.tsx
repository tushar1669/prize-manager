import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useFinalPrizeData, FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';

interface CeremonyScriptViewProps {
  tournamentId: string;
}

function sortWinners(winners: FinalPrizeWinnerRow[]) {
  return [...winners].sort((a, b) => {
    const mainComparison = Number(b.isMain) - Number(a.isMain);
    if (mainComparison !== 0) return mainComparison;

    const orderA = typeof a.categoryOrder === 'number' ? a.categoryOrder : 999;
    const orderB = typeof b.categoryOrder === 'number' ? b.categoryOrder : 999;
    if (orderA !== orderB) return orderA - orderB;

    const nameComparison = a.categoryName.localeCompare(b.categoryName);
    if (nameComparison !== 0) return nameComparison;

    return a.place - b.place;
  });
}

function renderPlace(place: number) {
  if (place === 1) return 'Champion';
  if (place === 2) return 'Runner-up';
  if (place === 3) return 'Second Runner-up';
  return `Place ${place}`;
}

export function CeremonyScriptView({ tournamentId }: CeremonyScriptViewProps) {
  const { data, isLoading, error } = useFinalPrizeData(tournamentId);

  const winners = useMemo(() => sortWinners(data?.winners ?? []), [data?.winners]);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Preparing ceremony script…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mx-auto mt-10 max-w-2xl">
        <AlertDescription>
          Unable to load the ceremony script. Please refresh the page and try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (!winners.length) {
    return (
      <Alert className="mx-auto mt-10 max-w-2xl">
        <AlertDescription>No winners have been allocated yet.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-5xl px-6 pb-16 print:mt-3 print:px-0 print:pb-4">
      <ol className="ceremony-script flex flex-col gap-5 text-foreground print:gap-2.5 print:text-black">
        {winners.map((winner, index) => (
          <li
            key={winner.prizeId}
            className="ceremony-line pm-print-avoid-break rounded-lg border border-border bg-card px-6 py-6 shadow-sm transition hover:border-primary/50 print:rounded-md print:border-black/30 print:bg-white print:px-4 print:py-3 print:shadow-none"
          >
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 print:gap-x-3 print:gap-y-2">
              <div className="flex items-center gap-4 print:gap-2">
                <div className="text-5xl font-black leading-none text-primary print:text-2xl print:text-black">{index + 1}</div>
                <div className="space-y-1 print:space-y-0">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80 print:text-[9px] print:tracking-wider print:text-black/70">
                    {winner.categoryName}
                  </div>
                  <div className="text-2xl font-bold leading-tight text-foreground print:text-sm print:text-black">
                    {renderPlace(winner.place)}
                  </div>
                </div>
              </div>
              <div className="min-w-[12rem] flex-1 text-3xl font-bold leading-none text-foreground print:text-base print:text-black">
                {winner.playerName}
              </div>
              <div className="text-2xl font-bold leading-none text-success print:text-base print:text-black">
                {formatCurrencyINR(winner.amount)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-muted-foreground print:mt-1.5 print:gap-x-3 print:text-[10px] print:text-black/60">
              <span>{winner.club || '—'}</span>
              <span>{winner.state || '—'}</span>
              <span>Rank {winner.rank ?? '—'}</span>
              <span>Seed #{winner.sno ?? '—'}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
