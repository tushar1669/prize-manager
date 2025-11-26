import { useMemo } from 'react';
import { FinalPrizeWinnerRow, useFinalPrizeData } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ArbiterSheetViewProps {
  winners?: FinalPrizeWinnerRow[];
  tournamentId?: string;
}

export function ArbiterSheetView({ winners: providedWinners, tournamentId }: ArbiterSheetViewProps) {
  const queryTournamentId = providedWinners?.length ? undefined : tournamentId;
  const { data, isLoading } = useFinalPrizeData(queryTournamentId);
  const winners = useMemo(() => providedWinners ?? data?.winners ?? [], [providedWinners, data?.winners]);

  return (
    <div className="mx-auto mt-8 max-w-6xl px-6 pb-12">
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm print:shadow-none">
        {isLoading && winners.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Preparing arbiter sheet…
          </div>
        ) : (
          <Table className="min-w-full text-base">
            <TableHeader className="bg-primary/10 text-left print:table-header-group">
              <TableRow className="border-border">
                <TableHead className="w-16 font-bold text-foreground">Place</TableHead>
                <TableHead className="font-bold text-foreground">Category</TableHead>
                <TableHead className="font-bold text-foreground">Player</TableHead>
                <TableHead className="font-bold text-foreground">SNo</TableHead>
                <TableHead className="font-bold text-foreground">Rank</TableHead>
                <TableHead className="font-bold text-foreground">Club</TableHead>
                <TableHead className="font-bold text-foreground">State</TableHead>
                <TableHead className="text-right font-bold text-foreground">Amount</TableHead>
                <TableHead className="w-24 font-bold text-foreground">Sign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {winners.map((winner, index) => (
                <TableRow key={winner.prizeId} className={index % 2 === 0 ? 'bg-muted/40 print:bg-transparent border-border' : 'border-border'}>
                  <TableCell className="font-bold text-primary">{winner.place}</TableCell>
                  <TableCell className="text-muted-foreground">{winner.categoryName}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">{winner.playerName}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{winner.sno || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{winner.rank || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{winner.club || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{winner.state || '—'}</TableCell>
                  <TableCell className="text-right font-bold text-success">{formatCurrencyINR(winner.amount)}</TableCell>
                  <TableCell className="border-l border-border">
                    <div className="h-6 rounded-md border border-dashed border-border"></div>
                  </TableCell>
                </TableRow>
              ))}
              {winners.length === 0 && !isLoading && (
                <TableRow className="border-border">
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No prize allocations found yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
