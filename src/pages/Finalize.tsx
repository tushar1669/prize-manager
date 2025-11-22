import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugifyWithSuffix } from "@/lib/slug";
import {
  ENABLE_PDF_EXPORT,
  ENABLE_REACT_PDF,
  PUBLIC_DOB_MASKING,
  PUBLISH_V2_ENABLED
} from "@/utils/featureFlags";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { exportPlayersViaPrint } from "@/utils/print";
import { Badge } from "@/components/ui/badge";
import { safeSelectPlayersByTournament } from "@/utils/safeSelectPlayers";
import { IneligibilityTooltip } from "@/components/allocation/IneligibilityTooltip";
import { NoAllocationGuard } from "@/components/allocation/NoAllocationGuard";
import { UnfilledPrizesPanel } from "@/components/allocation/UnfilledPrizesPanel";

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
  
  // Early guard: if no winners in state, show fallback UI and don't run queries
  const winners = (locationState?.winners || []) as Winner[];
  if (!locationState?.winners || winners.length === 0) {
    return <NoAllocationGuard />;
  }

  const previewMeta = locationState?.previewMeta ?? locationState?.meta ?? null;
  const unfilled = (locationState?.unfilled || []) as Unfilled[];
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
  const [isExportingPrint, setIsExportingPrint] = useState(false);
  const [isExportingPdfBeta, setIsExportingPdfBeta] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(locationState?.finalizeResult ?? null);

  // Fetch players and prizes to show winner details
  const { data: playersList } = useQuery({
    queryKey: ['players-finalize', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, count, usedColumns } = await safeSelectPlayersByTournament(
        id,
        ['id', 'name', 'rating', 'dob']
      );
      
      console.log('[finalize] Loaded players', { count, usedColumns });
      return data;
    },
    enabled: !!id && winners.length > 0
  });

  const { data: prizesList } = useQuery({
    queryKey: ['prizes-finalize', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, prizes(id, place, cash_amount, has_trophy, has_medal, is_active)')
        .eq('tournament_id', id);
      if (error) throw error;
      
      const prizes = (data || []).flatMap(cat => 
        (cat.prizes || []).map((p: any) => ({
          id: p.id,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          category_name: cat.name
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

  // Fetch summary data
  const { data: summary } = useQuery({
    queryKey: ['finalize-summary', id, winners],
    queryFn: async () => {
      // Fetch players count
      const { count: playerCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', id);
      
      // Fetch categories + prizes
      const { data: categories } = await supabase
        .from('categories')
        .select('*, prizes(*)')
        .eq('tournament_id', id);
      
      const allPrizes = categories?.flatMap(c => c.prizes || []) || [];
      
      // Calculate totals
      const totalPrizeFund = allPrizes.reduce((sum, p) => sum + (Number(p.cash_amount) || 0), 0);
      
      const totalCashDistributed = winners.reduce((sum, w) => {
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
        totalPrizeFund,
        totalCashDistributed,
        trophiesAwarded,
        medalsAwarded,
        mainPrizesCount,
        categoryPrizesCount
      };
    },
    enabled: !!id && winners.length > 0
  });

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
    onError: (error: any) => {
      console.error('[finalize] error', error);
      showError({
        title: "Finalization failed",
        message: error?.message || "Unknown error",
        hint: "Check console logs and try again."
      });
      toast.error(`Finalization failed: ${error.message}`);
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
        const { data, error } = await supabase.rpc('publish_tournament' as any, {
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
    onError: (error: any) => {
      toast.error(`Publish failed: ${error.message}`);
    }
  });

  const handleExportPrint = async () => {
    if (!id) {
      toast.error("Tournament ID missing");
      return;
    }

    try {
      setIsExportingPrint(true);
      await exportPlayersViaPrint({ tournamentId: id, maskDob: PUBLIC_DOB_MASKING });
      toast.success("Opened print preview — use Save as PDF from your browser.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to open print preview");
    } finally {
      setIsExportingPrint(false);
    }
  };

  const handleExportPdfBeta = async () => {
    if (!id) {
      toast.error("Tournament ID missing");
      return;
    }

    try {
      setIsExportingPdfBeta(true);
      const mod = await import(/* @vite-ignore */ "@/experimental/reactPdf");
      await mod.downloadPlayersPdf({ tournamentId: id, maskDob: PUBLIC_DOB_MASKING });
      toast.success("Players summary PDF exported");
    } catch (error: any) {
      console.error(`[export.pdf] error tournament=${id} message=${error?.message ?? error}`);
      toast.error("React-PDF not available, using print export instead");
      await handleExportPrint();
    } finally {
      setIsExportingPdfBeta(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-background">
      <BackBar label="Back to Review" to={`/t/${id}/review`} />
      <AppNav />
      <ErrorPanel error={error} onDismiss={clearError} />
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">{summary?.playerCount || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Players</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">{summary?.categoryCount || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">Prize Categories</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-accent">₹{summary?.totalPrizeFund || 0}</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Prize Fund</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allocation Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Main Prizes Awarded</span>
                <span className="font-medium text-foreground">{summary?.mainPrizesCount || 0} prizes</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Category Prizes Awarded</span>
                <span className="font-medium text-foreground">{summary?.categoryPrizesCount || 0} prizes</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Cash Distributed</span>
                <span className="font-medium text-accent">₹{summary?.totalCashDistributed || 0}</span>
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
          {prizesList && (
            <UnfilledPrizesPanel
              unfilled={unfilled}
              prizes={prizesList}
              categories={categoriesList}
            />
          )}

          {/* Winners Table */}
          <Card>
            <CardHeader>
              <CardTitle>Winners ({winners.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Winners: {previewSummary.winners}</span>
                  <span>·</span>
                  <span className="font-medium text-foreground">Conflicts: {previewSummary.conflicts}</span>
                  <span>·</span>
                  <span className="font-medium text-foreground">Unfilled: {previewSummary.unfilled}</span>
                </div>
                {previewSummary.unfilled > 0 && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                    Some categories are unfilled — review before publishing
                  </Badge>
                )}
              </div>
              <div className="rounded-md border overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Prize</th>
                      <th className="text-left p-2">Place</th>
                      <th className="text-left p-2">Player</th>
                      <th className="text-left p-2">Rating</th>
                      <th className="text-left p-2">Amount</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {winners.map((winner, idx) => {
                      const prize = prizesList?.find(p => p.id === winner.prizeId);
                      const player = playersList?.find(p => p.id === winner.playerId);
                      return (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{prize?.category_name || 'N/A'}</td>
                          <td className="p-2">#{prize?.place || 'N/A'}</td>
                          <td className="p-2">{player?.name || 'N/A'}</td>
                          <td className="p-2">{player?.rating || 'N/A'}</td>
                          <td className="p-2">₹{prize?.cash_amount || 0}</td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {winner.isManual ? 'Manual' : 'Auto'}
                            {prize?.has_trophy ? ' 🏆' : ''}
                            {prize?.has_medal ? ' 🥇' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ENABLE_PDF_EXPORT && (
                <div className="space-y-2">
                  <Button
                    onClick={handleExportPrint}
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isExportingPrint || winners.length === 0}
                  >
                    <span className="flex items-center gap-2">
                      <FileDown className="h-4 w-4" />
                      {isExportingPrint ? "Preparing Print…" : "Export PDF (Print)"}
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  {ENABLE_REACT_PDF && (
                    <Button
                      onClick={handleExportPdfBeta}
                      variant="secondary"
                      className="w-full justify-between"
                      disabled={isExportingPdfBeta || winners.length === 0}
                    >
                      <span className="flex items-center gap-2">
                        <FileDown className="h-4 w-4" />
                        {isExportingPdfBeta ? "Generating (Beta)…" : "Export PDF (React-PDF, beta)"}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/50 bg-primary/5">
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
                <Button
                  onClick={() => navigate(`/t/${id}/final/v1`)}
                  disabled={!winners || winners.length === 0}
                  variant="outline"
                  className="w-full"
                >
                  Final Prize Views
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between pt-4">
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
