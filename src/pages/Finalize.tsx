import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, ExternalLink, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { slugifyWithSuffix } from "@/lib/slug";
import { ENABLE_PDF_EXPORT, PUBLISH_V2_ENABLED } from "@/utils/featureFlags";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { buildWinnersPrintHtml, getWinnersExportColumns, openPrintWindow, type WinnersExportRow } from "@/utils/print";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { safeSelectPlayersByTournament } from "@/utils/safeSelectPlayers";
import { NoAllocationGuard } from "@/components/allocation/NoAllocationGuard";
import { UnfilledPrizesPanel } from "@/components/allocation/UnfilledPrizesPanel";
import { TeamPrizeResultsPanel } from "@/components/allocation/TeamPrizeResultsPanel";
import { useTeamPrizeResults } from "@/components/team-prizes/useTeamPrizeResults";
import { ImportQualityNotes } from "@/components/import/ImportQualityNotes";
import { useFinalizeData } from "@/hooks/useFinalizeData";
import { filterEmptyColumns, formatExportValue } from "@/utils/exportColumns";
import { groupWinnersByCategory } from "@/utils/finalizeWinners";

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

type PlayerExportRow = Record<string, unknown>;

const CATEGORY_PAGE_SIZE = 25;

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
  // unfilled now comes from useFinalizeData hook above
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
  const [isExportingWinnersPdf, setIsExportingWinnersPdf] = useState(false);
  const [isExportingWinnersXlsx, setIsExportingWinnersXlsx] = useState(false);
  const [isExportingRankingXlsx, setIsExportingRankingXlsx] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState(locationState?.finalizeResult ?? null);
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({});

  // Debug log: which source was used (once per mount)
  useEffect(() => {
    console.log('[finalize] Page loaded', {
      source: dataSource,
      version: dataVersion,
      winnersCount: winners.length,
      unfilledCount: unfilled.length,
    });
  }, [dataSource, dataVersion, winners.length, unfilled.length]);

  // Team prize results - always enabled in Finalize since allocations are finalized
  const {
    hasTeamPrizes,
    data: teamPrizeResults,
    isLoading: teamPrizeLoading,
    error: teamPrizeError,
  } = useTeamPrizeResults(id, { enabled: true });

  // Fetch players and prizes to show winner details
  const { data: playersList } = useQuery({
    queryKey: ['players-finalize', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, count, usedColumns } = await safeSelectPlayersByTournament(
        id,
        ['id', 'name', 'full_name', 'rating', 'rank']
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
      // Fetch tournament data including cash_prize_total (organizer-entered)
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('cash_prize_total')
        .eq('id', id)
        .maybeSingle();
      
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
      
      // Prize Fund (Configured) = sum of all defined prize amounts
      const configuredPrizeFund = allPrizes.reduce((sum, p) => sum + (Number(p.cash_amount) || 0), 0);
      
      // Cash Distributed = sum of allocated winners' cash
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

  const prizeById = useMemo(() => {
    return new Map(prizesList?.map(prize => [prize.id, prize]) ?? []);
  }, [prizesList]);

  const playerById = useMemo(() => {
    return new Map(playersList?.map(player => [player.id, player]) ?? []);
  }, [playersList]);

  const winnerRows = useMemo(() => {
    return winners.map(winner => ({
      winner,
      prize: prizeById.get(winner.prizeId),
      player: playerById.get(winner.playerId),
    }));
  }, [prizeById, playerById, winners]);

  const winnersByCategory = useMemo(() => {
    return groupWinnersByCategory(winnerRows);
  }, [winnerRows]);

  const winnerExportRows = useMemo<WinnersExportRow[]>(() => {
    return winnersByCategory.flatMap(group =>
      group.winners.map(row => {
        const criteria =
          row.prize?.category_criteria &&
          typeof row.prize.category_criteria === 'object' &&
          !Array.isArray(row.prize.category_criteria)
            ? (row.prize.category_criteria as Record<string, unknown>)
            : {};
        const allowedTypes = Array.isArray(criteria.allowed_types) ? criteria.allowed_types.filter(Boolean) : [];
        const allowedGroups = Array.isArray(criteria.allowed_groups) ? criteria.allowed_groups.filter(Boolean) : [];
        return {
          category: row.prize?.category_name ?? 'Unknown Category',
          prizePlace: row.prize?.place ?? null,
          playerRank: row.player?.rank ?? null,
          playerName: row.player?.name ?? 'N/A',
          amount: row.prize?.cash_amount ?? null,
          trophy: row.prize?.has_trophy ?? false,
          medal: row.prize?.has_medal ?? false,
          typeLabel: allowedTypes.length ? allowedTypes.join(', ') : null,
          groupLabel: allowedGroups.length ? allowedGroups.join(', ') : null,
        };
      })
    );
  }, [winnersByCategory]);

  const handleCategoryPageChange = (categoryId: string, page: number) => {
    setCategoryPages(prev => ({ ...prev, [categoryId]: page }));
  };

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
      
      // Extract structured error from edge function response
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

  const handleExportWinnersPdf = async () => {
    if (!id) {
      toast.error("Tournament ID missing");
      return;
    }

    try {
      if (!winnerExportRows.length) {
        toast.error("No winners available to export");
        return;
      }
      setIsExportingWinnersPdf(true);
      const { data: tournament, error: tournamentError } = await supabase
        .from("tournaments")
        .select("title, city, start_date, end_date")
        .eq("id", id)
        .maybeSingle();

      if (tournamentError) {
        throw tournamentError;
      }

      const html = buildWinnersPrintHtml(tournament ?? null, winnerExportRows);
      const opened = openPrintWindow(html, `winners-${id}`);
      if (!opened) {
        throw new Error("Popup blocked. Allow popups to print or save as PDF.");
      }
      toast.success("Opened winners print preview — save as PDF from your browser.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to open print preview";
      toast.error(message);
    } finally {
      setIsExportingWinnersPdf(false);
    }
  };

  const downloadXlsx = <T,>(rows: T[], columns: { label: string; value: (row: T) => unknown }[], filename: string, sheetName: string) => {
    const headers = columns.map(column => column.label);
    const data = rows.map(row => columns.map(column => formatExportValue(column.value(row))));
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  };

  const handleExportWinnersXlsx = async () => {
    if (!id) {
      toast.error("Tournament ID missing");
      return;
    }

    try {
      if (!winnerExportRows.length) {
        toast.error("No winners available to export");
        return;
      }
      setIsExportingWinnersXlsx(true);
      const columns = filterEmptyColumns(winnerExportRows, getWinnersExportColumns());
      downloadXlsx(winnerExportRows, columns, `winners-${id}.xlsx`, "Winners");
      toast.success("Winners XLSX exported");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to export winners XLSX";
      toast.error(message);
    } finally {
      setIsExportingWinnersXlsx(false);
    }
  };

  const handleExportRankingXlsx = async () => {
    if (!id) {
      toast.error("Tournament ID missing");
      return;
    }

    try {
      setIsExportingRankingXlsx(true);
      const preferredColumns = [
        'rank',
        'sno',
        'name',
        'full_name',
        'rating',
        'dob',
        'dob_raw',
        'gender',
        'fide_id',
        'federation',
        'state',
        'city',
        'club',
        'disability',
        'unrated',
        'group_label',
        'type_label',
        'special_notes',
        'notes',
      ];
      const { data: players, usedColumns } = await safeSelectPlayersByTournament(
        id,
        preferredColumns,
        { column: 'rank', ascending: true }
      );

      if (!players || players.length === 0) {
        toast.error("No players available to export");
        return;
      }

      const columnLabels: Record<string, string> = {
        rank: 'Rank',
        sno: 'SNo',
        name: 'Name',
        full_name: 'Full Name',
        rating: 'Rating',
        dob: 'DOB',
        dob_raw: 'DOB Raw',
        gender: 'Gender',
        fide_id: 'FIDE ID',
        federation: 'Federation',
        state: 'State',
        city: 'City',
        club: 'Club',
        disability: 'Disability',
        unrated: 'Unrated',
        group_label: 'Group',
        type_label: 'Type',
        special_notes: 'Special Notes',
        notes: 'Notes',
      };

      const columns = filterEmptyColumns(
        players as PlayerExportRow[],
        usedColumns.map(column => ({
          key: column,
          label: columnLabels[column] ?? column.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: (row: PlayerExportRow) => row[column],
        }))
      );

      downloadXlsx(players, columns, `ranking-${id}.xlsx`, "Ranking");
      toast.success("Full ranking XLSX exported");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to export ranking XLSX";
      toast.error(message);
    } finally {
      setIsExportingRankingXlsx(false);
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

          {id && <ImportQualityNotes tournamentId={id} />}

          <Card>
            <CardHeader>
              <CardTitle>Allocation Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Winners & Unfilled counts */}
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
              {/* Breakdown by type */}
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
              {/* Summary info is shown in Allocation Summary card above - no duplicate bar */}
              <div className="mb-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Winners by category
                </p>
              </div>

              <Accordion
                type="multiple"
                defaultValue={winnersByCategory.map(group => group.id)}
                className="rounded-md border border-border"
              >
                {winnersByCategory.map(group => {
                  const pageIndex = categoryPages[group.id] ?? 0;
                  const totalPages = Math.max(1, Math.ceil(group.winners.length / CATEGORY_PAGE_SIZE));
                  const start = pageIndex * CATEGORY_PAGE_SIZE;
                  const pageWinners = group.winners.slice(start, start + CATEGORY_PAGE_SIZE);
                  return (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="px-3 text-left">
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{group.name}</span>
                          <span className="text-xs text-muted-foreground">{group.winners.length} winners</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="rounded-md border border-border bg-background/50 overflow-auto max-h-80">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2">Place</th>
                                <th className="text-left p-2">Player</th>
                                <th className="text-left p-2">Rating</th>
                                <th className="text-left p-2">Amount</th>
                                <th className="text-left p-2">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pageWinners.map(row => (
                                <tr key={row.winner.prizeId} className="border-b">
                                  <td className="p-2">#{row.prize?.place ?? 'N/A'}</td>
                                  <td className="p-2">{row.player?.name || 'N/A'}</td>
                                  <td className="p-2">{row.player?.rating || 'N/A'}</td>
                                  <td className="p-2">₹{row.prize?.cash_amount || 0}</td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {row.winner.isManual ? 'Manual' : 'Auto'}
                                    {row.prize?.has_trophy ? ' 🏆' : ''}
                                    {row.prize?.has_medal ? ' 🥇' : ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {totalPages > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-2 text-xs text-muted-foreground">
                            <span>
                              Page {pageIndex + 1} of {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCategoryPageChange(group.id, Math.max(0, pageIndex - 1))}
                                disabled={pageIndex === 0}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCategoryPageChange(group.id, Math.min(totalPages - 1, pageIndex + 1))}
                                disabled={pageIndex >= totalPages - 1}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>

          {/* Team / Institution Prizes - only shown when configured */}
          {hasTeamPrizes && (
            <Card>
              <CardContent className="pt-6">
                <TeamPrizeResultsPanel
                  data={teamPrizeResults}
                  isLoading={teamPrizeLoading}
                  error={teamPrizeError}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ENABLE_PDF_EXPORT && (
                <div className="space-y-2">
                  <Button
                    onClick={handleExportWinnersPdf}
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isExportingWinnersPdf || winners.length === 0}
                  >
                    <span className="flex items-center gap-2">
                      <FileDown className="h-4 w-4" />
                      {isExportingWinnersPdf ? "Preparing Winners PDF…" : "Export Winners PDF"}
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={handleExportWinnersXlsx}
                    variant="secondary"
                    className="w-full justify-between"
                    disabled={isExportingWinnersXlsx || winners.length === 0}
                  >
                    <span className="flex items-center gap-2">
                      <FileDown className="h-4 w-4" />
                      {isExportingWinnersXlsx ? "Exporting Winners XLSX…" : "Export Winners XLSX"}
                    </span>
                  </Button>
                  <Button
                    onClick={handleExportRankingXlsx}
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isExportingRankingXlsx}
                  >
                    <span className="flex items-center gap-2">
                      <FileDown className="h-4 w-4" />
                      {isExportingRankingXlsx ? "Exporting Ranking XLSX…" : "Export Full Ranking XLSX"}
                    </span>
                  </Button>
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
