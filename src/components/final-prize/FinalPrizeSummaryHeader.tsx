import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyINR, formatNumberIN } from '@/utils/currency';
import { Share2, Printer } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

interface FinalPrizeSummaryHeaderProps {
  tournamentTitle?: string;
  city?: string | null;
  dateRange?: string;
  totals: {
    totalPrizes: number;
    totalCash: number;
    mainCount: number;
    categoryCount: number;
  };
}

export function FinalPrizeSummaryHeader({ tournamentTitle, city, dateRange, totals }: FinalPrizeSummaryHeaderProps) {
  const handleCopyLink = useCallback(() => {
    try {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Final prize list link copied');
    } catch (error) {
      console.error('[final-prize] copy failed', error);
      toast.error('Could not copy link. Try manually.');
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur print:static print:bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">{tournamentTitle || 'Final Prize List'}</h1>
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            {city && <span>{city}</span>}
            {dateRange && <span>• {dateRange}</span>}
            <Badge className="rounded-full bg-[#6B46C1] text-white shadow-sm">{formatNumberIN(totals.totalPrizes)} Prizes</Badge>
            <Badge variant="outline" className="rounded-full border-[#10B981]/50 text-[#0f5132]">
              {formatCurrencyINR(totals.totalCash)} Total Cash
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {formatNumberIN(totals.categoryCount)} Categories
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyLink} className="rounded-full border-[#6B46C1]/70 text-[#6B46C1] hover:bg-[#6B46C1]/10">
            <Share2 className="mr-2 h-4 w-4" /> Copy link
          </Button>
          <Button size="sm" onClick={handlePrint} className="rounded-full bg-[#6B46C1] text-white shadow">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>
    </header>
  );
}
