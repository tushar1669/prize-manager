import { useMemo, useCallback } from 'react';
import { Medal, Trophy, Printer, Download } from 'lucide-react';
import { FinalPrizeWinnerRow, useFinalPrizeData } from '@/hooks/useFinalPrizeData';
import { formatCurrencyINR } from '@/utils/currency';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { downloadWorkbookXlsx } from '@/utils/excel';
import { toast } from 'sonner';

interface ArbiterSheetViewProps {
  winners?: FinalPrizeWinnerRow[];
  tournamentId?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function ArbiterSheetView({ winners: providedWinners, tournamentId }: ArbiterSheetViewProps) {
  const queryTournamentId = providedWinners?.length ? undefined : tournamentId;
  const { data, isLoading } = useFinalPrizeData(queryTournamentId);
  const winners = useMemo(() => providedWinners ?? data?.winners ?? [], [providedWinners, data?.winners]);
  const tournamentTitle = data?.tournament?.title ?? 'Tournament';

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportXlsx = useCallback(() => {
    if (winners.length === 0) {
      toast.error('No data to export');
      return;
    }

    // Build rows for Excel export
    const rows = winners.map((winner, index) => ({
      'Category Order': winner.categoryOrder ?? index + 1,
      'Category Name': winner.categoryName ?? '',
      'Place': winner.place,
      'Player Name': winner.playerName ?? '',
      'Rank': winner.rank ?? '',
      'Amount': winner.amount ?? 0,
      'Trophy': winner.hasTrophy ? 'Yes' : 'No',
      'Medal': winner.hasMedal ? 'Yes' : 'No',
      'Signature': '', // Blank column for signature
    }));

    const today = new Date().toISOString().slice(0, 10);
    const safeSlug = sanitizeFilename(tournamentTitle);
    const filename = `${safeSlug}_final_v4_${today}.xlsx`;

    const success = downloadWorkbookXlsx(filename, { 'Arbiter Sheet': rows });
    if (success) {
      toast.success(`Exported ${rows.length} rows to ${filename}`);
    } else {
      toast.error('Export failed');
    }
  }, [winners, tournamentTitle]);

  return (
    <div className="mx-auto mt-8 max-w-6xl px-6 pb-12 print:mt-3 print:w-full print:max-w-none print:px-0 print:pb-4">
      {/* Toolbar - hidden in print */}
      <div className="mb-4 flex items-center justify-end gap-2 pm-print-hide">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportXlsx}
          disabled={winners.length === 0}
          className="rounded-full"
        >
          <Download className="mr-2 h-4 w-4" />
          Export XLSX
        </Button>
        <Button
          size="sm"
          onClick={handlePrint}
          className="rounded-full bg-primary text-primary-foreground shadow hover:bg-primary-hover"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm print:overflow-visible print:rounded-none print:border-black print:bg-white print:shadow-none">
        {isLoading && winners.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Preparing arbiter sheet…
          </div>
        ) : (
          <Table className="min-w-full text-base print:text-[11px]">
            <TableHeader className="bg-primary/10 text-left print:table-header-group print:bg-black/5">
              <TableRow className="border-border print:border-black">
                <TableHead className="w-16 font-bold text-foreground print:text-black">Place</TableHead>
                <TableHead className="font-bold text-foreground print:text-black">Category</TableHead>
                <TableHead className="font-bold text-foreground print:text-black">Player</TableHead>
                <TableHead className="font-bold text-foreground print:text-black">Rank</TableHead>
                <TableHead className="text-right font-bold text-foreground print:text-black">Amount</TableHead>
                <TableHead className="w-20 text-center font-bold text-foreground print:text-black">Trophy</TableHead>
                <TableHead className="w-20 text-center font-bold text-foreground print:text-black">Medal</TableHead>
                <TableHead className="w-24 font-bold text-foreground print:text-black">Sign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {winners.map((winner, index) => (
                <TableRow key={winner.prizeId} className={index % 2 === 0 ? 'bg-muted/40 print:bg-transparent border-border' : 'border-border print:border-black/20'}>
                  <TableCell className="font-bold text-primary print:text-black">{winner.place}</TableCell>
                  <TableCell className="text-muted-foreground print:text-black/70">{winner.categoryName}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground print:text-black">{winner.playerName}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground print:text-black/70">{winner.rank || '—'}</TableCell>
                  <TableCell className="text-right font-bold text-success print:text-black">{formatCurrencyINR(winner.amount)}</TableCell>
                  <TableCell className="text-center text-muted-foreground print:text-black/70">
                    {winner.hasTrophy ? <Trophy className="mx-auto h-4 w-4 text-accent print:text-black" /> : '—'}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground print:text-black/70">
                    {winner.hasMedal ? <Medal className="mx-auto h-4 w-4 text-success print:text-black" /> : '—'}
                  </TableCell>
                  <TableCell className="border-l border-border print:border-black/30">
                    <div className="h-6 rounded-md border border-dashed border-border print:border-black/30"></div>
                  </TableCell>
                </TableRow>
              ))}
              {winners.length === 0 && !isLoading && (
                <TableRow className="border-border print:border-black">
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground print:text-black/70">
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
