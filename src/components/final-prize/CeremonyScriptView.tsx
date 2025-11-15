import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';

interface CeremonyScriptViewProps {
  winners: FinalPrizeWinnerRow[];
}

export function CeremonyScriptView({ winners }: CeremonyScriptViewProps) {
  return (
    <div className="mx-auto mt-8 max-w-4xl px-6 pb-12">
      <ol className="ceremony-script space-y-4">
        {winners.map((winner, index) => (
          <li
            key={winner.prizeId}
            className="ceremony-line flex flex-col gap-1 rounded-2xl border border-border/60 bg-white p-4 shadow-sm shadow-[#6B46C1]/5 print:shadow-none"
          >
            <span className="text-sm font-medium text-[#6B46C1]">{index + 1}. {winner.categoryName}</span>
            <div className="text-lg font-semibold text-foreground">
              {winner.place === 1 ? 'Champion' : `Place ${winner.place}`} • {winner.playerName}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground">
              <span>{formatCurrencyINR(winner.amount)}</span>
              <span>{winner.club || '—'}</span>
              <span>{winner.state || '—'}</span>
              <span>Rank {winner.rank ?? '—'}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
