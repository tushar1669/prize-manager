import { Navigate, useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { AppNav } from '@/components/AppNav';
import { BackBar } from '@/components/BackBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { useFinalPrizeData } from '@/hooks/useFinalPrizeData';
import { FinalPrizeSummaryHeader } from '@/components/final-prize/FinalPrizeSummaryHeader';
import { CategoryCardsView } from '@/components/final-prize/CategoryCardsView';
import { CeremonyScriptView } from '@/components/final-prize/CeremonyScriptView';
import { PosterGridView } from '@/components/final-prize/PosterGridView';
import { ArbiterSheetView } from '@/components/final-prize/ArbiterSheetView';
import { format } from 'date-fns';

const VIEW_TABS = [
  { id: 'v1', label: 'Category Cards' },
  { id: 'v2', label: 'Ceremony Script' },
  { id: 'v3', label: 'Poster Grid' },
  { id: 'v4', label: 'Arbiter Sheet' },
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
  const normalized = normalizeView(view);

  if (!normalized) {
    return <Navigate to={`/t/${id}/final/v1`} replace />;
  }

  const { data, isLoading, error, grouped } = useFinalPrizeData(id);

  const dateRange = useMemo(() => buildDateRange(data?.tournament?.start_date, data?.tournament?.end_date), [data?.tournament]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppNav />
      <BackBar backTo={`/t/${id}/finalize`}>
        Final prize list
      </BackBar>
      {data && (
        <FinalPrizeSummaryHeader
          tournamentTitle={data.tournament?.title}
          city={data.tournament?.city}
          dateRange={dateRange}
          totals={data.totals}
        />
      )}
      <main className="pb-16">
        <div className="mx-auto mt-6 max-w-7xl px-6">
          <Tabs value={normalized} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto rounded-full bg-white p-1 shadow-sm">
              {VIEW_TABS.map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  asChild
                  className="rounded-full px-4 text-sm font-medium data-[state=active]:bg-[#6B46C1] data-[state=active]:text-white"
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
              {!isLoading && !error && data && data.winners.length === 0 && (
                <Alert className="mx-auto max-w-3xl">
                  <AlertDescription>No winners have been allocated yet.</AlertDescription>
                </Alert>
              )}
            </div>
            {data && data.winners.length > 0 && (
              <>
                <TabsContent value="v1" className="m-0">
                  <CategoryCardsView categories={data.categories} byCategory={grouped.byCategory} />
                </TabsContent>
                <TabsContent value="v2" className="m-0">
                  <CeremonyScriptView winners={data.winners} />
                </TabsContent>
                <TabsContent value="v3" className="m-0">
                  <PosterGridView winners={data.winners} tournamentId={id as string} />
                </TabsContent>
                <TabsContent value="v4" className="m-0">
                  <ArbiterSheetView winners={data.winners} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
