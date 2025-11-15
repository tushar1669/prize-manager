import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ArbiterSheetViewProps {
  winners: FinalPrizeWinnerRow[];
}

export function ArbiterSheetView({ winners }: ArbiterSheetViewProps) {
  return (
    <div className="mx-auto mt-8 max-w-6xl px-6 pb-12">
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-white shadow-sm shadow-[#6B46C1]/10 print:shadow-none">
        <Table className="min-w-full text-sm">
          <TableHeader className="bg-[#6B46C1]/10 text-left print:table-header-group">
            <TableRow>
              <TableHead className="w-16">Place</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Player</TableHead>
              <TableHead>SNo</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Club</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-24">Sign</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {winners.map((winner, index) => (
              <TableRow key={winner.prizeId} className={index % 2 === 0 ? 'bg-muted/40 print:bg-transparent' : ''}>
                <TableCell className="font-semibold text-[#2D1B69]">{winner.place}</TableCell>
                <TableCell>{winner.categoryName}</TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{winner.playerName}</div>
                </TableCell>
                <TableCell>{winner.sno || '—'}</TableCell>
                <TableCell>{winner.rank || '—'}</TableCell>
                <TableCell>{winner.club || '—'}</TableCell>
                <TableCell>{winner.state || '—'}</TableCell>
                <TableCell className="text-right font-semibold text-[#10B981]">{formatCurrencyINR(winner.amount)}</TableCell>
                <TableCell className="border-l border-border/60">
                  <div className="h-6 rounded-md border border-dashed border-border/60"></div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
