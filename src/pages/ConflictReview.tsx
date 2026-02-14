import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ALLOC_VERBOSE_LOGS } from "@/utils/featureFlags";
import { safeSelectPlayersByTournament } from "@/utils/safeSelectPlayers";
import { getPlayerDisplayName } from "@/utils/playerName";
import { BackBar } from "@/components/BackBar";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IneligibilityTooltip } from "@/components/allocation/IneligibilityTooltip";
import { AllocationDebugReport } from "@/components/allocation/AllocationDebugReport";
import { AllocationOverviewPanel } from "@/components/allocation/AllocationOverviewPanel";
import { TeamPrizeResultsPanel } from "@/components/allocation/TeamPrizeResultsPanel";
import { ImportQualityNotes } from "@/components/import/ImportQualityNotes";
import { useTeamPrizeResults } from "@/components/team-prizes/useTeamPrizeResults";
import { formatReasonCode } from "@/utils/reasonCodeLabels";
import type { AllocationCoverageEntry } from "@/types/allocation";
import { useTournamentAccess } from "@/hooks/useTournamentAccess";
import { applyReviewPreviewLimit } from "@/utils/reviewAccess";

interface Winner {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
}

interface Conflict {
  id: string;
  type: string;
  impacted_players: string[];
  impacted_prizes: string[];
  reasons: string[];
  suggested: { prizeId: string; playerId: string } | null;
}

interface Unfilled {
  prizeId: string;
  reasonCodes: string[];
}

type ManualDecisionReason = "manual_override" | "suggested_resolution";

type ManualDecisionsMap = Record<string, { playerId: string; reason: ManualDecisionReason }>;

type RuleConfigQueryRow = Pick<
  Database["public"]["Tables"]["rule_config"]["Row"],
  | "strict_age"
  | "allow_unrated_in_rating"
  | "allow_missing_dob_for_age"
  | "max_age_inclusive"
  | "prefer_main_on_equal_value"
  | "main_vs_side_priority_mode"
  | "age_band_policy"
  | "tournament_id"
  | "created_at"
  | "updated_at"
>;

// Removed: now using shared formatReasonCode from @/utils/reasonCodeLabels

const manualMapToOverrides = (map: ManualDecisionsMap) =>
  Object.entries(map).map(([prizeId, decision]) => ({ prizeId, playerId: decision.playerId }));

export default function ConflictReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { error, clearError } = useErrorPanel();

  const [winners, setWinners] = useState<Winner[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [unfilled, setUnfilled] = useState<Unfilled[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{
    playerCount?: number;
    activePrizeCount?: number;
    winnersCount?: number;
    conflictCount?: number;
    unfilledCount?: number;
  } | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [overrideDrawerOpen, setOverrideDrawerOpen] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [manualDecisions, setManualDecisions] = useState<ManualDecisionsMap>({});
  const manualDecisionsRef = useRef<ManualDecisionsMap>({});
  const allocTriggeredRef = useRef(false);
  
  // Preview mode state
  const [isPreviewMode, setIsPreviewMode] = useState(true);
  const [coverageData, setCoverageData] = useState<AllocationCoverageEntry[]>([]);
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const [winnersExpanded, setWinnersExpanded] = useState(false);
  const { hasFullAccess, previewMainLimit } = useTournamentAccess(id);
  const canViewFullResults = hasFullAccess;

  useEffect(() => {
    manualDecisionsRef.current = manualDecisions;
  }, [manualDecisions]);

  // Fetch scoped players and prizes for this tournament
  const { data: tournamentData } = useQuery({
    queryKey: ['tournament-data', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('tournaments')
        .select('slug, title')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: playersList } = useQuery({
    queryKey: ['players-list', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, count, usedColumns } = await safeSelectPlayersByTournament(
        id,
        ['id', 'name', 'rank', 'dob', 'dob_raw', 'rating', 'gender'],
        { column: 'rank', ascending: true, nullsFirst: false }
      );
      
      console.log('[review] Loaded players', { count, usedColumns });
      return data;
    },
    enabled: !!id,
  });

  const { data: prizesList } = useQuery({
    queryKey: ['prizes-list', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, prizes(id, place, cash_amount, has_trophy, has_medal, is_active)')
        .eq('tournament_id', id);
      if (error) throw error;
      
      type PrizeRow = { id: string; place: number; cash_amount: number | null; has_trophy: boolean; has_medal: boolean; is_active?: boolean };
      const prizes = (data || []).flatMap(cat => 
        ((cat.prizes || []) as PrizeRow[]).map((p) => ({
          id: p.id,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          category_name: cat.name
        }))
      );
      console.log('[review] prizes:', prizes.length);
      return prizes;
    },
    enabled: !!id
  });

  const { data: ruleConfig } = useQuery({
    queryKey: ['rule-config', id],
    queryFn: async () => {
      const { data, error }: { data: RuleConfigQueryRow | null; error: PostgrestError | null } = await supabase
        .from('rule_config')
        .select('strict_age, allow_unrated_in_rating, allow_missing_dob_for_age, max_age_inclusive, prefer_main_on_equal_value, main_vs_side_priority_mode, age_band_policy, tournament_id, created_at, updated_at')
        .eq('tournament_id', id)
        .maybeSingle();
      if (error) throw error;
      // Provide defaults if rule_config doesn't exist yet
      return data || {
        strict_age: true,
        allow_unrated_in_rating: false,
        allow_missing_dob_for_age: false,
        max_age_inclusive: true,
        prefer_main_on_equal_value: true,
        main_vs_side_priority_mode: 'main_first',
        age_band_policy: 'non_overlapping',
        tournament_id: id,
      };
    },
    enabled: !!id
  });

  const prizeFlagsById = useMemo(() => {
    const map = new Map<string, { has_trophy: boolean; has_medal: boolean }>();
    for (const prize of prizesList || []) {
      map.set(prize.id, {
        has_trophy: prize.has_trophy,
        has_medal: prize.has_medal,
      });
    }
    return map;
  }, [prizesList]);

  const enrichCoverageEntries = useCallback((coverage: AllocationCoverageEntry[]) => {
    return coverage.map((entry) => {
      const prizeId = entry.prize_id ?? entry.prizeId;
      const prizeFlags = prizeId ? prizeFlagsById.get(prizeId) : undefined;

      return {
        ...entry,
        has_trophy: entry.has_trophy == null ? prizeFlags?.has_trophy : entry.has_trophy,
        has_medal: entry.has_medal == null ? prizeFlags?.has_medal : entry.has_medal,
      };
    });
  }, [prizeFlagsById]);

  // Use shared hook for team prize results
  const {
    hasTeamPrizes,
    data: teamPrizeResults,
    isLoading: teamPrizeLoading,
    error: teamPrizeError,
  } = useTeamPrizeResults(id, { enabled: previewCompleted });

  const allocateMutation = useMutation({
    mutationFn: async (options?: { ruleOverride?: unknown; overrides?: { prizeId: string; playerId: string }[]; dryRun?: boolean }) => {
      const { ruleOverride, overrides, dryRun = false } = options || {};
      const { data: { session } } = await supabase.auth.getSession();

      const overridesPayload = overrides ?? manualMapToOverrides(manualDecisionsRef.current);
      
      const playersCount = playersList?.length || 0;

      console.log('[allocatePrizes] invoking with:', {
        tournamentId: id,
        playersCount,
        prizesCount: prizesList?.length || 0,
        ruleConfigOverride: ruleOverride || null,
        overridesCount: overridesPayload.length
      });
      
      // Gate: skip allocate if no players
      if (playersCount === 0) {
        console.info('[review] skip allocate: 0 players');
        return { winners: [], conflicts: [], unfilled: [], meta: {} };
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${session?.access_token}`,
      };

      if (ALLOC_VERBOSE_LOGS) {
        headers['x-alloc-verbose'] = 'true';
      }

      const { data, error } = await supabase.functions.invoke('allocatePrizes', {
        body: {
          tournamentId: id,
          ruleConfigOverride: ruleOverride || undefined,
          overrides: overridesPayload.length > 0 ? overridesPayload : undefined,
          dryRun,
        },
        headers,
      });
      if (error) throw error;

      console.log('[allocatePrizes] result:', data);
      return data as {
        winners: Winner[];
        conflicts: Conflict[];
        unfilled?: Unfilled[];
        coverage?: AllocationCoverageEntry[];
        meta?: {
          playerCount?: number;
          activePrizeCount?: number;
          activeCategoryCount?: number;
          winnersCount?: number;
          conflictCount?: number;
          unfilledCount?: number;
          dryRun?: boolean;
        };
      };
    },
    onSuccess: (data) => {
      const manualMap = manualDecisionsRef.current;
      const winnersWithReasons = (data.winners || []).map(winner => {
        const decision = manualMap[winner.prizeId];
        if (decision && decision.playerId === winner.playerId) {
          const reasonSet = new Set(winner.reasons);
          reasonSet.add(decision.reason);
          return { ...winner, reasons: Array.from(reasonSet), isManual: true };
        }
        return winner;
      });

      setWinners(winnersWithReasons);
      setConflicts(data.conflicts);
      setSelectedConflict(prev => (prev && !data.conflicts.find(conflict => conflict.id === prev.id) ? null : prev));
      setUnfilled(data.unfilled || []);
      setPreviewMeta(data.meta || null);
      
      // Handle coverage data from preview
      if (data.coverage) {
        const normalizedCoverage = enrichCoverageEntries(data.coverage);

        setCoverageData(normalizedCoverage);
        setPreviewCompleted(true);
        console.log('[review] Preview completed, coverage:', normalizedCoverage);
        
        const totalUnfilled = normalizedCoverage.filter(c => c.is_unfilled).length;
        const blockedByPolicy = normalizedCoverage.filter(c => c.reason_code === 'BLOCKED_BY_ONE_PRIZE_POLICY').length;
        const noEligible = normalizedCoverage.filter(c =>
          c.reason_code === 'NO_ELIGIBLE_PLAYERS' ||
          (c.reason_code && c.reason_code.startsWith('TOO_STRICT_CRITERIA_'))
        ).length;
        const critical = normalizedCoverage.filter(c =>
          c.reason_code === 'INTERNAL_ERROR' || c.reason_code === 'CATEGORY_INACTIVE'
        ).length;

        if (critical > 0) {
          toast.error(`Preview found ${critical} critical allocation error(s). Fix those before committing.`);
        } else if (totalUnfilled > 0) {
          toast.warning(
            `Preview shows ${totalUnfilled} unfilled prize(s): ` +
            `${blockedByPolicy} blocked by one-prize policy, ` +
            `${noEligible} with no eligible players. You can still commit, but review the debug report.`
          );
        } else {
          toast.success('Preview looks good! You can now commit the allocation.');
        }
      }
      
      // Mark preview as complete when committing
      if (data.meta?.dryRun === false) {
        setIsPreviewMode(false);
      }

      const nextManualMap: ManualDecisionsMap = {};
      winnersWithReasons.forEach(winner => {
        if (!winner.isManual) return;
        const existing = manualMap[winner.prizeId];
        if (existing && existing.playerId === winner.playerId) {
          nextManualMap[winner.prizeId] = existing;
        } else {
          const derivedReason = (winner.reasons.includes('suggested_resolution')
            ? 'suggested_resolution'
            : 'manual_override') as ManualDecisionReason;
          nextManualMap[winner.prizeId] = { playerId: winner.playerId, reason: derivedReason };
        }
      });

      manualDecisionsRef.current = nextManualMap;
      setManualDecisions(nextManualMap);

      const conflictCount = data.conflicts.length;
      const unfilledCount = data.unfilled?.length ?? 0;
      console.log('[review] players:', playersList?.length || 0, 'prizes:', prizesList?.length || 0, 'winners:', winnersWithReasons.length, 'conflicts:', conflictCount, 'unfilled:', unfilledCount);
      toast.info(conflictCount === 0 && unfilledCount === 0 ? 'All clear!' : `${conflictCount} conflicts · ${unfilledCount} unfilled`);
    },
    onError: (err: unknown) => {
      console.error('[allocatePrizes] error', err);
      allocTriggeredRef.current = false;
      const errObj = err as { message?: string; context?: { error?: { message?: string } } };
      // Check if it's a network-level failure
      if (errObj?.message?.includes('net::ERR_FAILED') || errObj?.message?.includes('Failed to fetch')) {
        toast.error('Allocation failed: Network error. Check your connection or try again.');
      } else {
        const msg = errObj?.context?.error?.message || errObj?.message || 'Unknown error';
        toast.error(`Allocation failed: ${msg}`);
      }
    }
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Tournament ID missing');
      if (winners.length === 0) throw new Error('No allocations to finalize');

      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('finalize', {
        body: { tournamentId: id, winners },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (error) throw error;
      return data as { version: number; allocationsCount: number };
    },
    onSuccess: (data) => {
      toast.success(`Finalized as version ${data.version} with ${data.allocationsCount} allocations`);
      navigate(`/t/${id}/finalize`, { state: { winners, previewMeta, conflicts, unfilled, finalizeResult: data } });
    },
    onError: (error: unknown) => {
      console.error('[finalize] error from review', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to finalize allocations';
      toast.error(errMsg);
    }
  });

  useEffect(() => {
    if (!id) return;

    const playersLoaded = playersList !== undefined;
    const prizesLoaded = prizesList !== undefined;
    const playersCount = playersList?.length ?? 0;
    const prizesCount = prizesList?.length ?? 0;
    const winnersCount = winners.length;
    const ready = playersLoaded && prizesLoaded;
    const hasCounts = playersCount > 0 && prizesCount > 0;

    const loaded = { players: playersLoaded, prizes: prizesLoaded };

    console.log('[review.gate]', {
      playersCount,
      prizesCount,
      winnersCount,
      loaded,
      ready,
      message: 'Auto-allocation disabled. Use Preview/Commit buttons.',
    });

    // Reset trigger when counts change
    if (!hasCounts) {
      allocTriggeredRef.current = false;
    }
  }, [id, playersList, prizesList, winners]);

  const handleAccept = async (conflictId: string) => {
    if (allocateMutation.isPending) return;
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict?.suggested) return;

    const { prizeId, playerId } = conflict.suggested;
    const prevManual = manualDecisionsRef.current;
    const nextManual: ManualDecisionsMap = {
      ...prevManual,
      [prizeId]: { playerId, reason: 'suggested_resolution' }
    };

    manualDecisionsRef.current = nextManual;
    setManualDecisions(nextManual);
    setSelectedConflict(prev => (prev?.id === conflictId ? null : prev));

    try {
      await allocateMutation.mutateAsync({ overrides: manualMapToOverrides(nextManual) });
      toast.success('Conflict resolved');
    } catch (err) {
      console.error('[conflicts] accept failed', err);
      manualDecisionsRef.current = prevManual;
      setManualDecisions(prevManual);
      toast.error('Failed to resolve conflict');
    }
  };

  const handleAcceptAll = async () => {
    if (allocateMutation.isPending) return;

    const prevManual = manualDecisionsRef.current;
    const nextManual: ManualDecisionsMap = { ...prevManual };
    let resolved = 0;

    const processedPrizes = new Set<string>();
    const processedPlayers = new Set<string>();

    conflicts.forEach(conflict => {
      if (!conflict.suggested) return;
      const { prizeId, playerId } = conflict.suggested;
      if (processedPrizes.has(prizeId) || processedPlayers.has(playerId)) return;
      processedPrizes.add(prizeId);
      processedPlayers.add(playerId);
      nextManual[prizeId] = { playerId, reason: 'suggested_resolution' };
      resolved++;
    });

    if (resolved === 0) {
      toast.info('No suggested resolutions available');
      return;
    }

    manualDecisionsRef.current = nextManual;
    setManualDecisions(nextManual);

    try {
      await allocateMutation.mutateAsync({ overrides: manualMapToOverrides(nextManual) });
      toast.success(`Resolved ${resolved} conflicts automatically`);
    } catch (err) {
      console.error('[conflicts] resolve all failed', err);
      manualDecisionsRef.current = prevManual;
      setManualDecisions(prevManual);
      toast.error('Failed to resolve conflicts');
    }
  };

  const handleOverride = async () => {
    if (!selectedConflict || !selectedPrize || !selectedPlayer) {
      toast.error('Please select both a prize and a player');
      return;
    }

    if (allocateMutation.isPending) return;

    const prevManual = manualDecisionsRef.current;
    const nextManual: ManualDecisionsMap = {
      ...prevManual,
      [selectedPrize]: { playerId: selectedPlayer, reason: 'manual_override' }
    };

    manualDecisionsRef.current = nextManual;
    setManualDecisions(nextManual);

    try {
      await allocateMutation.mutateAsync({ overrides: manualMapToOverrides(nextManual) });
      toast.success('Override applied');
      setOverrideDrawerOpen(false);
      setSelectedPrize("");
      setSelectedPlayer("");
      setSelectedConflict(null);
    } catch (err) {
      console.error('[conflicts] override failed', err);
      manualDecisionsRef.current = prevManual;
      setManualDecisions(prevManual);
      toast.error('Failed to apply override');
    }
  };

  const getPlayer = (playerId: string) => playersList?.find(p => p.id === playerId);
  const getPrize = (prizeId: string) => prizesList?.find(p => p.id === prizeId);

  const visibleResults = useMemo(
    () =>
      applyReviewPreviewLimit({
        canViewFullResults,
        previewMainLimit,
        coverage: coverageData,
        winners,
        conflicts,
        unfilled,
      }),
    [canViewFullResults, previewMainLimit, coverageData, winners, conflicts, unfilled],
  );

  const summaryCounts = {
    players: previewMeta?.playerCount ?? playersList?.length ?? 0,
    activePrizes: previewMeta?.activePrizeCount ?? prizesList?.length ?? 0,
    winners: visibleResults.winners.length,
    conflicts: visibleResults.conflicts.length,
    unfilled: visibleResults.unfilled.length,
  };

  const coverageCriticalCount = visibleResults.coverage.filter(c =>
    c.is_unfilled &&
    (c.reason_code === 'INTERNAL_ERROR' || c.reason_code === 'CATEGORY_INACTIVE')
  ).length;
  const coverageFilledCount = visibleResults.coverage.filter(c => !c.is_unfilled).length;
  const hasComputedAllocation = previewCompleted && (visibleResults.coverage.length > 0 || summaryCounts.winners > 0 || summaryCounts.conflicts > 0 || summaryCounts.unfilled > 0);
  const summaryFilledCount = visibleResults.coverage.length > 0 ? coverageFilledCount : summaryCounts.winners;

  const statusVariant: 'neutral' | 'error' | 'warning' | 'success' = !hasComputedAllocation
    ? 'neutral'
    : summaryCounts.conflicts > 0 || coverageCriticalCount > 0
      ? 'error'
      : summaryCounts.unfilled > 0
        ? 'warning'
        : 'success';

  const statusStyles = {
    neutral: 'border-border/70 bg-muted/40 text-foreground',
    error: 'border-red-500/40 bg-red-500/10 text-red-200',
    warning: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
    success: 'border-[#E59D1D]/40 bg-[#E59D1D]/10 text-[#F0CB54]',
  };

  const statusMessage = {
    neutral: 'Run Preview Allocation to compute winners and detect issues.',
    error: `Allocation has ${summaryCounts.conflicts} conflicts / ${coverageCriticalCount} critical issues. Review and resolve before committing.`,
    warning: `${summaryFilledCount} of ${summaryCounts.activePrizes} prizes have eligible winners. ${summaryCounts.unfilled} may remain unfilled.`,
    success: `All ${summaryCounts.activePrizes} prizes have eligible winners.`,
  }[statusVariant];

  return (
    <div className="min-h-screen bg-background">
      <BackBar label="Back to Import" to={`/t/${id}/import`} />
      <AppNav />
      <ErrorPanel error={error} onDismiss={clearError} />
      
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <TournamentProgressBreadcrumbs />
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Review Allocations</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {summaryCounts.conflicts > 0 && <Badge variant="destructive">{summaryCounts.conflicts} Conflicts</Badge>}
            {summaryCounts.unfilled > 0 && <Badge variant="secondary">{summaryCounts.unfilled} Unfilled</Badge>}
          </div>
        </div>

        <div className="mb-6 flex gap-4">
          <Button
            onClick={() => {
              setIsPreviewMode(true);
              allocTriggeredRef.current = false;
              allocateMutation.mutate({ 
                overrides: manualMapToOverrides(manualDecisionsRef.current),
                dryRun: true 
              });
            }}
            disabled={allocateMutation.isPending || (playersList?.length || 0) === 0}
            variant="outline"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${allocateMutation.isPending ? 'animate-spin' : ''}`} />
            Preview Allocation
          </Button>
          
          <Button
            onClick={() => {
              setIsPreviewMode(false);
              allocTriggeredRef.current = false;
              allocateMutation.mutate({ 
                overrides: manualMapToOverrides(manualDecisionsRef.current),
                dryRun: false 
              });
            }}
            disabled={(() => {
              // Allow commit if preview completed and no critical errors
              const hasCoverage = previewCompleted && coverageData.length > 0;
              const hasCriticalUnfilled = coverageData.some(c =>
                c.is_unfilled &&
                (c.reason_code === 'INTERNAL_ERROR' || c.reason_code === 'CATEGORY_INACTIVE')
              );
              return !hasCoverage || allocateMutation.isPending || hasCriticalUnfilled;
            })()}
            variant="default"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Commit Allocation
          </Button>
        </div>

        {/* Allocation Overview Panel - informational only */}
        <AllocationOverviewPanel
          ruleConfig={ruleConfig}
          players={playersList?.map(p => ({
            id: p.id,
            dob: p.dob,
            dob_raw: (p as { dob_raw?: string }).dob_raw,
            gender: (p as { gender?: string }).gender,
            rating: p.rating,
          }))}
          className="mb-6"
        />

        <Alert className="mb-6 border-border/80 bg-card shadow-sm">
          <AlertCircle className="h-4 w-4 text-primary" />
          <AlertTitle className="text-foreground">Allocation Summary</AlertTitle>
          <AlertDescription>
            <div className="grid gap-3 text-sm text-foreground sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-border/60 bg-background/60 p-3"><span className="block text-xs text-muted-foreground">Players</span><span className="text-base font-semibold">{summaryCounts.players}</span></div>
              <div className="rounded-md border border-border/60 bg-background/60 p-3"><span className="block text-xs text-muted-foreground">Active prizes</span><span className="text-base font-semibold">{summaryCounts.activePrizes}</span></div>
              <div className="rounded-md border border-border/60 bg-background/60 p-3"><span className="block text-xs text-muted-foreground">Winners</span><span className="text-base font-semibold">{summaryCounts.winners}</span></div>
              <div className="rounded-md border border-border/60 bg-background/60 p-3"><span className="block text-xs text-muted-foreground">Conflicts</span><span className="text-base font-semibold">{summaryCounts.conflicts}</span></div>
              <div className="rounded-md border border-border/60 bg-background/60 p-3"><span className="block text-xs text-muted-foreground">Unfilled</span><span className="text-base font-semibold">{summaryCounts.unfilled}</span></div>
            </div>
            <div className={`mt-4 rounded-md border p-4 text-base leading-6 ${statusStyles[statusVariant]}`}>
              <p>{statusMessage}</p>
            </div>
          </AlertDescription>
        </Alert>

        {id && <ImportQualityNotes tournamentId={id} />}

        <AllocationDebugReport
          coverage={visibleResults.coverage}
          totalPlayers={summaryCounts.players}
          totalPrizes={summaryCounts.activePrizes}
          tournamentSlug={tournamentData?.slug || tournamentData?.title || id}
          tournamentTitle={tournamentData?.title}
          winners={visibleResults.winners}
          players={playersList?.map(p => ({ 
            id: p.id, 
            name: p.name, 
            rank: (p as { rank?: number | null }).rank ?? null, 
            rating: p.rating 
          })) || []}
          exportsEnabled={hasComputedAllocation}
          canViewFullResults={canViewFullResults}
        />

        {/* Team / Institution Prize Results - shown when team prizes configured and preview completed */}
        {hasTeamPrizes && previewCompleted && (
          <div className="mb-6">
            <TeamPrizeResultsPanel
              data={teamPrizeResults}
              isLoading={teamPrizeLoading}
              error={teamPrizeError}
            />
          </div>
        )}

        {allocateMutation.isPending ? (
          <Card><CardContent className="py-12 text-center"><RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4" /></CardContent></Card>
        ) : (
          <div className="space-y-6">
            {(() => {
              if (visibleResults.conflicts.length > 0) {
                // Show conflicts list
                return (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold">Conflicts ({visibleResults.conflicts.length})</h2>
                      {visibleResults.conflicts.some(c => c.suggested) && (
                        <Button size="sm" disabled={allocateMutation.isPending} onClick={() => { void handleAcceptAll(); }}>
                          Resolve All
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-3">
                        {visibleResults.conflicts.map(conflict => {
                          const prize = conflict.impacted_prizes[0] ? getPrize(conflict.impacted_prizes[0]) : null;
                          const player = conflict.impacted_players[0] ? getPlayer(conflict.impacted_players[0]) : null;
                          
                          return (
                            <Card key={conflict.id} className="cursor-pointer transition-colors hover:bg-muted/50 hover:border-primary/50" onClick={() => setSelectedConflict(conflict)}>
                              <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Badge variant="destructive">
                                    {conflict.type === 'tie' ? 'Tie – identical prize priority' : conflict.type}
                                  </Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {player && (
                                  <p className="text-sm">
                                    <strong>Player:</strong> {getPlayerDisplayName(player)} (Rating: {player.rating || 'N/A'})
                                  </p>
                                )}
                                {prize && (
                                  <p className="text-sm">
                                    <strong>Prize:</strong> {prize.category_name} - Place #{prize.place} (₹{prize.cash_amount})
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {conflict.type === 'tie' 
                                    ? `Player is equally eligible for ${conflict.impacted_prizes.length} prizes with identical brochure order, value tier, cash, main-ness and place. Choose one.`
                                    : conflict.reasons.join(', ')
                                  }
                                </p>
                                <div className="flex gap-2 mt-3">
                                  {conflict.suggested && <Button size="sm" disabled={allocateMutation.isPending} onClick={(e) => { e.stopPropagation(); void handleAccept(conflict.id); }}>Accept</Button>}
                                  <Button size="sm" variant="outline" disabled={allocateMutation.isPending} onClick={(e) => { e.stopPropagation(); setSelectedConflict(conflict); setOverrideDrawerOpen(true); }}>Override</Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                );
              }

              return null;
            })()}

            <Card>
              <Collapsible open={winnersExpanded} onOpenChange={setWinnersExpanded}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer border-l-4 border-[#E59D1D]/70 bg-[#E59D1D]/5 pl-5">
                    <CardTitle className="flex items-center gap-2 text-[#F0CB54]">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2 w-2 rounded-full bg-[#E59D1D]/80"
                      />
                      Winners ({visibleResults.winners.length})
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    {visibleResults.winners.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">No winners allocated yet.</div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3 p-4">
                          {visibleResults.winners.map(winner => {
                            const prize = getPrize(winner.prizeId);
                            const player = getPlayer(winner.playerId);
                            return (
                              <div key={`${winner.prizeId}-${winner.playerId}`} className="rounded-lg border border-border bg-background p-3">
                                <div className="text-sm font-semibold">
                                  {prize ? `${prize.category_name} — Place #${prize.place}` : `Prize ${winner.prizeId}`}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {player ? getPlayerDisplayName(player) : `Player ${winner.playerId}`}
                                </div>
                                {winner.reasons.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {winner.reasons.map(reason => (
                                      <Badge
                                        key={`${winner.prizeId}-${winner.playerId}-${reason}`}
                                        variant={reason === 'manual_override' || reason === 'suggested_resolution' ? 'default' : 'outline'}
                                      >
                                        {formatReasonCode(reason)}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {visibleResults.unfilled.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Unfilled Prizes ({visibleResults.unfilled.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-3 p-4">
                      {visibleResults.unfilled.map(entry => {
                        const prize = getPrize(entry.prizeId);
                        return (
                          <div key={entry.prizeId} className="rounded-lg border border-dashed border-muted-foreground/50 bg-muted/40 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">
                                {prize ? `${prize.category_name} — Place #${prize.place}` : `Prize ${entry.prizeId}`}
                              </div>
                              <IneligibilityTooltip reasonCodes={entry.reasonCodes} />
                            </div>
                            {entry.reasonCodes.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {entry.reasonCodes.map(code => (
                                  <Badge key={`${entry.prizeId}-${code}`} variant="outline">
                                    {formatReasonCode(code)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => {
            if (!id) {
              toast.error('Tournament ID missing');
              navigate('/dashboard');
              return;
            }
            navigate(`/t/${id}/import`);
          }}>Back</Button>
          <Button
            onClick={() => {
              if (!id) {
                toast.error('Tournament ID missing');
                navigate('/dashboard');
                return;
              }
              finalizeMutation.mutate();
            }}
            disabled={
              isPreviewMode ||
              !previewCompleted ||
              winners.length === 0 ||
              conflicts.length > 0 ||
              finalizeMutation.isPending
            }
            title={
              isPreviewMode ? 'Commit allocation first' :
              !previewCompleted ? 'Run preview first' :
              conflicts.length > 0 ? 'Resolve all conflicts before finalizing' :
              winners.length === 0 ? 'No winners to finalize' :
              finalizeMutation.isPending ? 'Finalizing...' : ''
            }
          >
            {finalizeMutation.isPending ? 'Finalizing' : 'Finalize'} <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      <Sheet open={overrideDrawerOpen} onOpenChange={setOverrideDrawerOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Manual Override</SheetTitle>
            <SheetDescription>
              Assign a specific prize to a specific player
            </SheetDescription>
          </SheetHeader>
          {selectedConflict && <div className="space-y-6 mt-6">
            <div>
              <Label>Prize</Label>
              <Select value={selectedPrize} onValueChange={setSelectedPrize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a prize" />
                </SelectTrigger>
                <SelectContent>
                  {(prizesList || []).map(prize => (
                    <SelectItem key={prize.id} value={prize.id}>
                      {prize.category_name} — Place #{prize.place} (₹{prize.cash_amount}
                      {prize.has_trophy ? ' 🏆' : ''}{prize.has_medal ? ' 🥇' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Player</Label>
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a player" />
                </SelectTrigger>
                <SelectContent>
                  {(playersList || []).map(player => (
                    <SelectItem key={player.id} value={player.id}>
                      <div className="flex items-center gap-2">
                        {getPlayerDisplayName(player)} (Rating: {player.rating || 'N/A'}, DOB: {player.dob || 'N/A'})
                        {player.dob_raw && player.dob_raw !== player.dob && (
                          <span 
                            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border"
                            title="Month/day inferred as Jan 1"
                          >
                            Inferred
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => { void handleOverride(); }}
              disabled={!selectedPrize || !selectedPlayer || allocateMutation.isPending}
            >
              Apply Override
            </Button>
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
