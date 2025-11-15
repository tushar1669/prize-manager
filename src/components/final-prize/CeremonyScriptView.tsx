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
    <div className="mx-auto mt-8 max-w-5xl px-6 pb-16">
      <ol className="ceremony-script flex flex-col gap-4 text-slate-900 print:gap-3">
        {winners.map((winner, index) => (
          <li
            key={winner.prizeId}
            className="ceremony-line rounded-3xl border border-border/70 bg-white/95 px-6 py-5 shadow-sm shadow-[#6B46C1]/5 transition hover:border-[#6B46C1]/50 print:rounded-xl print:bg-white print:px-5 print:py-4 print:shadow-none"
          >
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-black leading-none text-[#6B46C1]">{index + 1}</div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6B46C1]/80">
                    {winner.categoryName}
                  </div>
                  <div className="text-2xl font-semibold leading-tight text-slate-900">
                    {renderPlace(winner.place)}
                  </div>
                </div>
              </div>
              <div className="min-w-[12rem] flex-1 text-3xl font-bold leading-none text-slate-900">
                {winner.playerName}
              </div>
              <div className="text-2xl font-semibold leading-none text-emerald-700">
                {formatCurrencyINR(winner.amount)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-muted-foreground print:mt-2 print:text-sm">
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
