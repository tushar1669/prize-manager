import { Navigate, useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

import { AppNav } from '@/components/AppNav';
import { BackBar } from '@/components/BackBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFinalPrizeData } from '@/hooks/useFinalPrizeData';
import { FinalPrizeSummaryHeader } from '@/components/final-prize/FinalPrizeSummaryHeader';
import { CategoryCardsView } from '@/components/final-prize/CategoryCardsView';
import { PosterGridView } from '@/components/final-prize/PosterGridView';
import { ArbiterSheetView } from '@/components/final-prize/ArbiterSheetView';
import { TeamPrizesTabView } from '@/components/final-prize/TeamPrizesTabView';

const VIEW_TABS = [
  { id: 'v1', label: 'Category Cards' },
  { id: 'v3', label: 'Poster Grid' },
  { id: 'v4', label: 'Arbiter Sheet' },
  { id: 'v5', label: 'Team Prizes' },
] as const;

type FinalViewId = (typeof VIEW_TABS)[number]['id'];

function normalizeView(view?: string): FinalViewId | null {
  return VIEW_TABS.find(tab => tab.id === view)?.id ?? null;
}

function buildDateRange(start?: string | null, end?: string | null) {
  if (!start) return undefined;
  try {
    const formattedStart = format(new Date(start), 'dd MMM yyyy');
    if (!end || end === start) return formattedStart;
    const formattedEnd = format(new Date(end), 'dd MMM yyyy');
    return `${formattedStart} – ${formattedEnd}`;
  } catch (error) {
    console.warn('[final-prize] Failed to format date range', error);
    return undefined;
  }
}

export default function FinalPrizeView() {
  const { id, view } = useParams();
  const { data, isLoading, error, grouped } = useFinalPrizeData(id);
  const normalized = normalizeView(view);
  const dateRange = useMemo(
    () => buildDateRange(data?.tournament?.start_date, data?.tournament?.end_date),
    [data?.tournament]
  );

  if (!normalized) {
    return <Navigate to={`/t/${id}/final/v1`} replace />;
  }

  // Team Prizes tab can show even without individual winners
  const showContent = data && (data.winners.length > 0 || normalized === 'v5');

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <div className="print:hidden">
        <AppNav />
        <BackBar label="Back to Finalization" to={`/t/${id}/finalize`} />
      </div>
      {data && (
        <FinalPrizeSummaryHeader
          tournamentTitle={data.tournament?.title}
          city={data.tournament?.city}
          dateRange={dateRange}
          winners={data.winners}
          totals={data.totals}
        />
      )}
      <main className="pb-16 print:pb-0">
        <div className="mx-auto mt-6 max-w-7xl px-6 pm-print-page print:mt-2 print:px-4">
          <Tabs value={normalized} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto rounded-lg bg-card border border-border p-1 shadow-sm print:hidden">
              {VIEW_TABS.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  asChild
                  className="rounded-md px-4 py-2 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Link to={`/t/${id}/final/${tab.id}`}>{tab.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-6">
              {isLoading && (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing prize data…
                </div>
              )}
              {error && (
                <Alert variant="destructive" className="mx-auto max-w-3xl">
                  <AlertDescription>Unable to load final prize data. Please try again in a moment.</AlertDescription>
                </Alert>
              )}
              {!isLoading && !error && data && data.winners.length === 0 && normalized !== 'v5' && (
                <Alert className="mx-auto max-w-3xl">
                  <AlertDescription>No winners have been allocated yet.</AlertDescription>
                </Alert>
              )}
            </div>
            {showContent && (
              <>
                <TabsContent value="v1" className={`m-0 ${normalized !== 'v1' ? 'print:hidden' : ''}`}>
                  <CategoryCardsView groups={grouped.groups} />
                </TabsContent>
                <TabsContent value="v3" className={`m-0 ${normalized !== 'v3' ? 'print:hidden' : ''}`}>
                  <PosterGridView winners={data.winners} tournamentId={id as string} />
                </TabsContent>
                <TabsContent value="v4" className={`m-0 ${normalized !== 'v4' ? 'print:hidden' : ''}`}>
                  <ArbiterSheetView winners={data.winners} tournamentId={id as string} />
                </TabsContent>
                <TabsContent value="v5" className={`m-0 ${normalized !== 'v5' ? 'print:hidden' : ''}`}>
                  <TeamPrizesTabView tournamentId={id as string} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
