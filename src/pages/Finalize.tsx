import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowRight, Download, Printer, Info } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugifyWithSuffix } from "@/lib/slug";
import { PUBLISH_V2_ENABLED } from "@/utils/featureFlags";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { NoAllocationGuard } from "@/components/allocation/NoAllocationGuard";
import { UnfilledPrizesPanel } from "@/components/allocation/UnfilledPrizesPanel";
import { ImportQualityNotes } from "@/components/import/ImportQualityNotes";
import { useFinalizeData } from "@/hooks/useFinalizeData";
import { useFinalPrizeData } from "@/hooks/useFinalPrizeData";
import { CategoryCardsView } from "@/components/final-prize/CategoryCardsView";
import { PosterGridView } from "@/components/final-prize/PosterGridView";
import { ArbiterSheetView } from "@/components/final-prize/ArbiterSheetView";
import { TeamPrizesTabView } from "@/components/final-prize/TeamPrizesTabView";
import { buildFinalPrizeExportRows } from "@/utils/finalPrizeExport";
import { downloadWorkbookXlsx, sanitizeFilename } from "@/utils/excel";
import { useTournamentAccess } from "@/hooks/useTournamentAccess";
import { getUpgradeUrl } from "@/utils/upgradeUrl";

interface Winner {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
}

interface AllocationPreviewMeta {
  playerCount?: number;
  activePrizeCount?: number;
  winnersCount?: number;
  conflictCount?: number;
  unfilledCount?: number;
}

interface Unfilled {
  prizeId: string;
  reasonCodes: string[];
}

interface PrizeRecord {
  id: string;
  place: number | null;
  cash_amount: number | null;
  has_trophy: boolean | null;
  has_medal: boolean | null;
  is_active: boolean | null;
}

interface CategoryRecord {
  id: string;
  name: string;
  order_idx: number | null;
  criteria_json: unknown;
  prizes?: PrizeRecord[] | null;
  is_main?: boolean | null;
}

type FinalViewTab = 'v1' | 'v3' | 'v4' | 'v5';

export default function Finalize() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    winners?: Winner[];
    previewMeta?: AllocationPreviewMeta;
    meta?: AllocationPreviewMeta;
    conflicts?: unknown[];
    conflictsCount?: number;
    conflictCount?: number;
    unfilled?: Unfilled[];
    unfilledCount?: number;
    finalizeResult?: { version: number; allocationsCount: number };
  } | undefined;
  
  // Use hook that handles both location state AND DB fallback
  const {
    winners,
    unfilled,
    version: dataVersion,
    source: dataSource,
    isLoading: dataLoading,
    error: dataError,
  } = useFinalizeData(id, locationState);

  const previewMeta = locationState?.previewMeta ?? locationState?.meta ?? null;
  const fallbackConflicts = Array.isArray(locationState?.conflicts)
    ? locationState.conflicts.length
    : typeof locationState?.conflictsCount === 'number'
      ? locationState.conflictsCount
      : typeof locationState?.conflictCount === 'number'
        ? locationState.conflictCount
        : 0;
  const fallbackUnfilled = unfilled.length > 0 
    ? unfilled.length 
    : typeof locationState?.unfilledCount === 'number'
      ? locationState.unfilledCount
      : 0;
  const previewSummary = {
    winners: previewMeta?.winnersCount ?? winners.length,
    conflicts: previewMeta?.conflictCount ?? fallbackConflicts,
    unfilled: previewMeta?.unfilledCount ?? fallbackUnfilled,
  };
  const { error, showError, clearError } = useErrorPanel();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { role } = useUserRole();
  const [finalizeResult, setFinalizeResult] = useState(locationState?.finalizeResult ?? null);
  const [activeView, setActiveView] = useState<FinalViewTab>('v1');

  // Debug log: which source was used (once per mount)
  useEffect(() => {
    console.log('[finalize] Page loaded', {
      source: dataSource,
      version: dataVersion,
      winnersCount: winners.length,
      unfilledCount: unfilled.length,
    });
  }, [dataSource, dataVersion, winners.length, unfilled.length]);

  // Fetch prizes for unfilled panel
  const { data: prizesList } = useQuery({
    queryKey: ['prizes-finalize', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, order_idx, criteria_json, prizes(id, place, cash_amount, has_trophy, has_medal, is_active)')
        .eq('tournament_id', id);
      if (error) throw error;
      
      const prizes = (data as CategoryRecord[] || []).flatMap(cat =>
        (cat.prizes || []).map(p => ({
          id: p.id,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          category_id: cat.id,
          category_name: cat.name,
          category_order: typeof cat.order_idx === 'number' ? cat.order_idx : 999,
          category_criteria: cat.criteria_json,
        }))
      );
      return prizes;
    },
    enabled: !!id && winners.length > 0
  });

  // Fetch categories for unfilled prizes panel
  const { data: categoriesList } = useQuery({
    queryKey: ['categories-finalize', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .eq('tournament_id', id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id && unfilled.length > 0
  });

  // Fetch next version number
  const { data: nextVersion } = useQuery({
    queryKey: ['next-version', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select('version')
        .eq('tournament_id', id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.version ?? 0) + 1;
    },
  });

  const publishVersion = finalizeResult?.version ?? nextVersion ?? 1;

  // Fetch summary data including organizer-entered prize fund
  const { data: summary } = useQuery({
    queryKey: ['finalize-summary', id, winners],
    queryFn: async () => {
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('cash_prize_total')
        .eq('id', id)
        .maybeSingle();
      
      const { count: playerCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', id);
      
      const { data: categories } = await supabase
        .from('categories')
        .select('*, prizes(*)')
        .eq('tournament_id', id);
      
      const allPrizes = categories?.flatMap(c => c.prizes || []) || [];
      
      const configuredPrizeFund = allPrizes.reduce((sum, p) => sum + (Number(p.cash_amount) || 0), 0);
      
      const cashDistributed = winners.reduce((sum, w) => {
        const prize = allPrizes.find(p => p.id === w.prizeId);
        return sum + (Number(prize?.cash_amount) || 0);
      }, 0);
      
      const trophiesAwarded = winners.filter(w => {
        const prize = allPrizes.find(p => p.id === w.prizeId);
        return prize?.has_trophy;
      }).length;
      
      const medalsAwarded = winners.filter(w => {
        const prize = allPrizes.find(p => p.id === w.prizeId);
        return prize?.has_medal;
      }).length;

      const mainPrizesCount = winners.filter(w => {
        const prize = allPrizes.find(p => p.id === w.prizeId);
        const category = categories?.find(c => c.prizes?.some(p => p.id === prize?.id));
        return category?.is_main;
      }).length;

      const categoryPrizesCount = winners.length - mainPrizesCount;
      
      return { 
        playerCount: playerCount || 0,
        categoryCount: categories?.length || 0,
        organizerPrizeFund: Number(tournament?.cash_prize_total) || 0,
        configuredPrizeFund,
        cashDistributed,
        trophiesAwarded,
        medalsAwarded,
        mainPrizesCount,
        categoryPrizesCount
      };
    },
    enabled: !!id && winners.length > 0
  });

  const { data: finalPrizeData, grouped: finalPrizeGrouped, isLoading: finalPrizeLoading } = useFinalPrizeData(id);
  const { hasFullAccess, previewMainLimit, isFreeSmall, errorCode: accessErrorCode } = useTournamentAccess(id);
  const finalizeUpgradeUrl = useMemo(() => (id ? getUpgradeUrl(id, `/t/${id}/finalize`) : '/dashboard'), [id]);
  const finalizeCouponUrl = useMemo(() => (id ? getUpgradeUrl(id, `/t/${id}/finalize`, { coupon: true }) : '/dashboard'), [id]);

  // Export XLSX for the active tab (reuses same 3-sheet workbook as FinalPrizeSummaryHeader)
  const exportRows = useMemo(
    () => buildFinalPrizeExportRows(finalPrizeData?.winners ?? []),
    [finalPrizeData?.winners]
  );

  const arbiterRows = useMemo(
    () => exportRows.map(row => ({ ...row, Signature: '' })),
    [exportRows]
  );

  const handleTabExportXlsx = useCallback(() => {
    if (!finalPrizeData?.winners?.length) {
      toast.error('No data to export');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const safeSlug = sanitizeFilename(finalPrizeData?.tournament?.title || 'final_prize');
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
  }, [arbiterRows, exportRows, finalPrizeData?.winners?.length, finalPrizeData?.tournament?.title]);

  const handleTabPrint = useCallback(() => {
    window.print();
  }, []);

  const finalizeMutation = useMutation({
    mutationFn: async (winners: Winner[]) => {
      console.log('[finalize] invoking finalize', { tournamentId: id, winnersCount: winners.length });
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('finalize', {
        body: { tournamentId: id, winners },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      
      if (error) throw error;
      console.log('[finalize] success', data);
      return data as { version: number; allocationsCount: number };
    },
    onSuccess: (data) => {
      console.log('[finalize] finalize complete', data);
      setFinalizeResult(data);
      toast.success(`Finalized as version ${data.version} with ${data.allocationsCount} allocations`);
    },
    onError: (error: unknown) => {
      console.error('[finalize] error', error);
      
      const errorContext =
        typeof error === 'object' && error !== null && 'context' in error
          ? (error as { context?: { body?: { error?: string; hint?: string } } }).context
          : undefined;
      const errorBody = errorContext?.body;
      const message =
        errorBody?.error ||
        (error instanceof Error ? error.message : "Unknown error");
      const hint = errorBody?.hint || "Check console logs and try again.";
      
      showError({
        title: "Finalization failed",
        message: message,
        hint: hint
      });
      toast.error(`Finalization failed: ${message}`);
    }
  });

  useEffect(() => {
    if (!id || winners.length === 0 || finalizeResult || finalizeMutation.isPending) return;
    finalizeMutation.mutate(winners);
  }, [finalizeMutation, finalizeMutation.isPending, finalizeResult, id, winners]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Tournament ID missing');

      const requestId = crypto.randomUUID();
      console.log(`[publish] request id=${requestId} tournament=${id}`);

      if (PUBLISH_V2_ENABLED) {
        const { data, error } = await supabase.rpc('publish_tournament', {
          tournament_id: id,
          requested_slug: null
        });

        if (error) {
          console.error(`[publish] error id=${requestId} message=${error.message}`);
          throw error;
        }

        const payload = Array.isArray(data) ? data?.[0] : data;

        if (!payload?.slug) {
          console.error(`[publish] error id=${requestId} message=missing slug from RPC`);
          throw new Error('Publish RPC did not return a slug');
        }

        console.log(`[publish] ok id=${requestId} slug=${payload.slug}`);
        return { slug: payload.slug };
      }

      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .select('title, public_slug, id')
        .eq('id', id)
        .maybeSingle();

      if (tournamentError) {
        console.error(`[publish] error id=${requestId} message=${tournamentError.message}`);
        throw tournamentError;
      }
      if (!tournament) {
        console.error(`[publish] error id=${requestId} message=tournament not found`);
        throw new Error('Tournament not found');
      }

      const slug = tournament.public_slug || slugifyWithSuffix(tournament.title || 'tournament');

      const { error: updateError } = await supabase
        .from('tournaments')
        .update({
          is_published: true,
          public_slug: slug,
          status: 'published'
        })
        .eq('id', id);

      if (updateError) {
        console.error(`[publish] error id=${requestId} message=${updateError.message}`);
        throw updateError;
      }

      const { data: { user } } = await supabase.auth.getUser();
          const { error: pubError } = await supabase
            .from('publications')
            .upsert({
              tournament_id: id,
              slug,
              version: publishVersion,
              published_by: user?.id,
              is_active: true
            }, { onConflict: 'tournament_id,version' });

      if (pubError) {
        console.error(`[publish] error id=${requestId} message=${pubError.message}`);
        throw pubError;
      }

      console.log(`[publish] ok id=${requestId} slug=${slug}`);
      return { slug };
    },
    onSuccess: ({ slug }) => {
      toast.success(`Published — /p/${slug}`);
      queryClient.invalidateQueries({ queryKey: ['tournaments', user?.id, role] });
      console.log('[dashboard] query invalidated after mutation');
      navigate(`/t/${id}/publish`, { state: { slug } });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Publish failed';
      toast.error(`Publish failed: ${message}`);
    }
  });

  const handlePublish = () => {
    if (winners.length === 0) {
      toast.error("No allocations to finalize");
      return;
    }

    const proceed = async () => {
      if (!id) {
        toast.error('Tournament ID missing');
        navigate('/dashboard');
        return;
      }

      try {
        const result = finalizeResult ?? await finalizeMutation.mutateAsync(winners);
        setFinalizeResult(result);
        navigate(`/t/${id}/publish`, { state: { version: result.version } });
      } catch (error) {
        console.error('[finalize] publish flow error', error);
      }
    };

    void proceed();
  };

  // Show loading state when fetching from DB
  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show guard only when NO data exists (not in state AND not in DB)
  if (winners.length === 0 && !dataLoading) {
    return <NoAllocationGuard />;
  }

  const isTeamTab = activeView === 'v5';

  return (
    <div className="min-h-screen bg-background">
      <div className="print:hidden">
        <BackBar label="Back to Review" to={`/t/${id}/review`} />
        <AppNav />
        <ErrorPanel error={error} onDismiss={clearError} />
      </div>
      
      <div className="container mx-auto px-6 py-8 max-w-4xl print:max-w-none print:px-0 print:py-0">
        <div className="print:hidden">
          <TournamentProgressBreadcrumbs />
          
          <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-foreground">Finalize Allocations</h1>
                <span className="text-xs rounded-full px-2 py-1 bg-muted">
                v{publishVersion}
                </span>
              </div>
            <p className="text-muted-foreground">
              Review final allocations before publishing
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Tournament Summary — UNCHANGED */}
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Tournament Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">{summary?.playerCount || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Players</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">{summary?.categoryCount || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">Prize Categories</p>
                </div>
              </div>
              
              {/* Prize Fund breakdown - three distinct values */}
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="text-center p-4 bg-muted rounded-lg" title="Amount entered by organizer in tournament setup">
                  <p className="text-2xl font-bold text-foreground">₹{summary?.organizerPrizeFund?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Prize Fund (Organizer)</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg" title="Sum of all configured prize amounts">
                  <p className="text-2xl font-bold text-foreground">₹{summary?.configuredPrizeFund?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Prize Fund (Configured)</p>
                </div>
                <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20" title="Total cash allocated to winners">
                  <p className="text-2xl font-bold text-primary">₹{summary?.cashDistributed?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Cash Distributed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Free tier note */}
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30 print:hidden">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-200">Free for tournaments up to 100 players.</p>
              <p className="mt-0.5 text-blue-700/80 dark:text-blue-300/70">Import your players first. If your tournament has 100 or fewer players, Pro features are enabled automatically.</p>
            </div>
          </div>

          <div className="print:hidden">
            {id && <ImportQualityNotes tournamentId={id} />}
          </div>

          {/* Allocation Summary — UNCHANGED */}
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Allocation Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Winners Allocated</span>
                <span className="font-medium text-foreground">{winners.length}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Unfilled Prizes</span>
                <span className={`font-medium ${unfilled.length > 0 ? 'text-amber-600' : 'text-foreground'}`}>
                  {unfilled.length}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Main Prizes Awarded</span>
                <span className="font-medium text-foreground">{summary?.mainPrizesCount || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Category Prizes Awarded</span>
                <span className="font-medium text-foreground">{summary?.categoryPrizesCount || 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Trophies Awarded</span>
                <span className="font-medium text-foreground">{summary?.trophiesAwarded || 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Medals Awarded</span>
                <span className="font-medium text-foreground">{summary?.medalsAwarded || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Unfilled Prizes Panel */}
          <div className="print:hidden">
            {prizesList && (
              <UnfilledPrizesPanel
                unfilled={unfilled}
                prizes={prizesList}
                categories={categoriesList}
              />
            )}
          </div>

          {/* Publish CTA — moved ABOVE Final Prize Views */}
          <Card className="border-primary/50 bg-primary/5 print:hidden">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4">
                By publishing, you create an immutable version (v{publishVersion}) of these allocations.
                The tournament will be available at a public URL that can be shared with participants.
              </p>
              <div className="space-y-3">
                <Button 
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                  variant="outline"
                  className="w-full"
                >
                  {publishMutation.isPending ? 'Publishing...' : 'Make Public'}
                </Button>
                <Button
                  onClick={() => navigate(`/t/${id}/public`)}
                  disabled={!winners || winners.length === 0}
                  variant="secondary"
                  className="w-full"
                >
                  View Public Page
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Final Prize Views — embedded as tabs */}
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="flex flex-row items-center justify-between print:hidden">
              <div className="flex flex-col gap-1">
                <CardTitle>Final Prize Views</CardTitle>
                {accessErrorCode === 'backend_migration_missing' && (
                  <p className="text-xs text-destructive">Backend not deployed yet (DB migrations missing).</p>
                )}
                {!hasFullAccess && accessErrorCode !== 'backend_migration_missing' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Preview mode — some views are locked</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTabExportXlsx}
                  disabled={isTeamTab || !finalPrizeData?.winners?.length || !hasFullAccess}
                  title={!hasFullAccess ? 'Upgrade to Pro to export' : undefined}
                  className="rounded-full"
                >
                  <Download className="mr-2 h-4 w-4" /> Export XLSX
                </Button>
                <Button
                  size="sm"
                  onClick={handleTabPrint}
                  disabled={(isTeamTab && !finalPrizeData?.winners?.length) || !hasFullAccess}
                  title={!hasFullAccess ? 'Upgrade to Pro to print' : undefined}
                  className="rounded-full"
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="print:p-0">
              {!hasFullAccess && accessErrorCode !== 'backend_migration_missing' && (
                <div className="mb-4 rounded-lg border-2 border-primary/40 bg-primary/10 p-4 print:hidden">
                  <p className="text-sm font-semibold text-foreground">Unlock all finalize views</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upgrade now or apply a coupon to unlock Poster Grid, Arbiter Sheet, and export/print actions.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button className="sm:w-auto" onClick={() => navigate(finalizeUpgradeUrl)}>
                      Upgrade to Pro
                    </Button>
                    <Button
                      variant="outline"
                      className="sm:w-auto"
                      onClick={() => navigate(finalizeCouponUrl)}
                    >
                      Apply Coupon
                    </Button>
                  </div>
                </div>
              )}
              {finalPrizeLoading ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing prize data…
                </div>
              ) : (
                <Tabs value={activeView} onValueChange={v => setActiveView(v as FinalViewTab)} className="w-full">
                  <TabsList className="w-full justify-start overflow-x-auto rounded-lg bg-muted p-1 print:hidden">
                    <TabsTrigger value="v1" className="rounded-md px-4 py-2 text-sm font-medium">
                      Category Cards
                    </TabsTrigger>
                    <TabsTrigger value="v3" className="rounded-md px-4 py-2 text-sm font-medium">
                      Poster Grid
                    </TabsTrigger>
                    <TabsTrigger value="v4" className="rounded-md px-4 py-2 text-sm font-medium">
                      Arbiter Sheet
                    </TabsTrigger>
                    <TabsTrigger value="v5" className="rounded-md px-4 py-2 text-sm font-medium">
                      Team Prizes
                    </TabsTrigger>
                  </TabsList>
                  <div className="pm-print-surface">
                    <TabsContent value="v1" className="m-0">
                      <CategoryCardsView groups={finalPrizeGrouped.groups} hasFullAccess={hasFullAccess} previewMainLimit={previewMainLimit} />
                    </TabsContent>
                    <TabsContent value="v3" className="m-0">
                      <PosterGridView winners={finalPrizeData?.winners ?? []} tournamentId={id as string} hasFullAccess={hasFullAccess} />
                    </TabsContent>
                    <TabsContent value="v4" className="m-0">
                      <ArbiterSheetView winners={finalPrizeData?.winners} tournamentId={id as string} hasFullAccess={hasFullAccess} />
                    </TabsContent>
                    <TabsContent value="v5" className="m-0">
                      <TeamPrizesTabView tournamentId={id as string} />
                    </TabsContent>
                  </div>
                </Tabs>
              )}
            </CardContent>
          </Card>

          {/* Bottom action bar */}
          <div className="flex justify-between pt-4 print:hidden">
            <Button variant="outline" onClick={() => {
              if (!id) {
                toast.error('Tournament ID missing');
                navigate('/dashboard');
                return;
              }
              navigate(`/t/${id}/review`);
            }}>
              Back to Review
            </Button>
            <Button 
              onClick={handlePublish} 
              className="gap-2"
              disabled={finalizeMutation.isPending || winners.length === 0}
            >
              {finalizeMutation.isPending ? "Publishing..." : "Publish Tournament"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
