import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyINR, formatNumberIN } from '@/utils/currency';
import { downloadWorkbookXlsx, sanitizeFilename } from '@/utils/excel';
import { buildFinalPrizeExportRows } from '@/utils/finalPrizeExport';
import { FinalPrizeWinnerRow } from '@/hooks/useFinalPrizeData';
import { Printer, Download, Lock, Info } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

interface FinalPrizeSummaryHeaderProps {
  tournamentTitle?: string;
  city?: string | null;
  dateRange?: string;
  winners: FinalPrizeWinnerRow[];
  totals: {
    totalPrizes: number;
    totalCash: number;
    mainCount: number;
    categoryCount: number;
  };
  hasFullAccess?: boolean;
  accessErrorCode?: string | null;
}

export function FinalPrizeSummaryHeader({ tournamentTitle, city, dateRange, winners, totals, hasFullAccess = true, accessErrorCode }: FinalPrizeSummaryHeaderProps) {
  const exportRows = useMemo(
    () => buildFinalPrizeExportRows(winners),
    [winners]
  );

  const arbiterRows = useMemo(
    () => exportRows.map(row => ({ ...row, Signature: '' })),
    [exportRows]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportXlsx = useCallback(() => {
    if (winners.length === 0) {
      toast.error('No data to export');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const safeSlug = sanitizeFilename(tournamentTitle || 'final_prize');
    const filename = `${safeSlug}_final_prizes_${today}.xlsx`;

    const success = downloadWorkbookXlsx(filename, {
      Winners: exportRows,
      'Poster Grid': exportRows,
      'Arbiter Sheet': arbiterRows,
    });

    if (success) {
      toast.success(`Exported ${exportRows.length} rows to ${filename}`);
    } else {
      toast.error('Export failed');
    }
  }, [arbiterRows, exportRows, tournamentTitle, winners.length]);

  return (
    <>
      {/* Toolbar header - hidden in print */}
      <header className="pm-print-hide sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">{tournamentTitle || 'Final Prize List'}</h1>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {city && <span>{city}</span>}
              {dateRange && <span>• {dateRange}</span>}
              <Badge className="rounded-full bg-primary text-primary-foreground shadow-sm">
                {formatNumberIN(totals.totalPrizes)} Prizes
              </Badge>
              <Badge variant="outline" className="rounded-full border-success/50 text-success">
                {formatCurrencyINR(totals.totalCash)} Total Cash
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                {formatNumberIN(totals.categoryCount)} Categories
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {accessErrorCode === 'backend_migration_missing' && (
              <div className="flex items-center gap-2 rounded-full border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
                <Info className="h-3.5 w-3.5" />
                Backend not deployed yet (DB migrations missing).
              </div>
            )}
            {!hasFullAccess && accessErrorCode !== 'backend_migration_missing' && (
              <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <Lock className="h-3.5 w-3.5" />
                Preview mode — Upgrade to Pro for full access
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportXlsx}
                disabled={!hasFullAccess}
                title={!hasFullAccess ? 'Upgrade to Pro to export' : undefined}
                className="rounded-full border-primary text-primary hover:bg-primary/10"
              >
                <Download className="mr-2 h-4 w-4" /> Export XLSX
              </Button>
              <Button
                size="sm"
                onClick={handlePrint}
                disabled={!hasFullAccess}
                title={!hasFullAccess ? 'Upgrade to Pro to print' : undefined}
                className="rounded-full bg-primary text-primary-foreground shadow hover:bg-primary-hover"
              >
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Printable header - visible ONLY in print */}
      <header className="pm-print-header hidden print:block print:mb-4 print:border-b print:border-black/20 print:pb-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-black">{tournamentTitle || 'Final Prize List'}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-black/80">
            {city && <span>{city}</span>}
            {dateRange && <span>• {dateRange}</span>}
            <span>• {formatNumberIN(totals.totalPrizes)} Prizes</span>
            <span>• {formatCurrencyINR(totals.totalCash)} Total Cash</span>
            <span>• {formatNumberIN(totals.categoryCount)} Categories</span>
          </div>
        </div>
        <p className="pm-print-settings-note hidden mt-2 text-center text-xs text-black/50 print:block">
          For best results, enable "Background graphics" in your print settings.
        </p>
      </header>
    </>
  );
}
