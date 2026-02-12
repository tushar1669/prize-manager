import { useEffect, useMemo, useRef, useState } from "react";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, CheckCircle2, RefreshCw, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      // Cast to any to handle main_vs_side_priority_mode which may not exist in all DB schemas
      const { data, error } = await supabase.from('rule_config').select('strict_age, allow_unrated_in_rating, allow_missing_dob_for_age, max_age_inclusive, prefer_main_on_equal_value, main_vs_side_priority_mode, age_band_policy, tournament_id, created_at, updated_at').eq('tournament_id', id).maybeSingle() as { data: unknown; error: unknown };
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
        const normalizedCoverage = data.coverage.map((entry) => {
          const prizeId = entry.prize_id ?? entry.prizeId;
          const prizeFlags = prizeId ? prizeFlagsById.get(prizeId) : undefined;
          return {
            ...entry,
            has_trophy: entry.has_trophy ?? prizeFlags?.has_trophy,
            has_medal: entry.has_medal ?? prizeFlags?.has_medal,
          };
        });

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

  const summaryCounts = {
    players: previewMeta?.playerCount ?? playersList?.length ?? 0,
    activePrizes: previewMeta?.activePrizeCount ?? prizesList?.length ?? 0,
    winners: previewMeta?.winnersCount ?? winners.length,
    conflicts: previewMeta?.conflictCount ?? conflicts.length,
    unfilled: previewMeta?.unfilledCount ?? unfilled.length,
  };

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

        <Alert className="mb-6 border-primary/30 bg-primary/10">
          <AlertCircle className="h-4 w-4 text-primary" />
          <AlertTitle className="text-foreground">Allocation {isPreviewMode ? 'Preview' : 'Summary'}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
              <div><span className="font-medium">Players:</span> {summaryCounts.players}</div>
              <div><span className="font-medium">Active prizes:</span> {summaryCounts.activePrizes}</div>
              <div><span className="font-medium">Winners:</span> {summaryCounts.winners}</div>
              <div><span className="font-medium">Conflicts:</span> {summaryCounts.conflicts}</div>
              <div><span className="font-medium">Unfilled:</span> {summaryCounts.unfilled}</div>
            </div>
          </AlertDescription>
        </Alert>

        {id && <ImportQualityNotes tournamentId={id} />}

        {previewCompleted && coverageData.length > 0 && (
          <AllocationDebugReport
            coverage={coverageData}
            totalPlayers={summaryCounts.players}
            totalPrizes={summaryCounts.activePrizes}
            tournamentSlug={tournamentData?.slug || tournamentData?.title || id}
            tournamentTitle={tournamentData?.title}
            winners={winners}
            players={playersList?.map(p => ({ 
              id: p.id, 
              name: p.name, 
              rank: (p as { rank?: number | null }).rank ?? null, 
              rating: p.rating 
            })) || []}
          />
        )}

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
              // Compute unfilled and critical counts from coverage data
              const unfilledCount = coverageData.filter(c => c.is_unfilled).length;
              const criticalCount = coverageData.filter(c =>
                c.is_unfilled &&
                (c.reason_code === 'INTERNAL_ERROR' || c.reason_code === 'CATEGORY_INACTIVE')
              ).length;
              const filledCount = coverageData.filter(c => !c.is_unfilled).length;
              const totalPrizes = coverageData.length;

              if (conflicts.length > 0) {
                // Show conflicts list
                return (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold">Conflicts ({conflicts.length})</h2>
                      {conflicts.some(c => c.suggested) && (
                        <Button size="sm" disabled={allocateMutation.isPending} onClick={() => { void handleAcceptAll(); }}>
                          Resolve All
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-3">
                        {conflicts.map(conflict => {
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

              // Show status card based on critical/unfilled counts
              if (criticalCount > 0) {
                return (
                  <Card className="border-amber-500/50 bg-amber-500/10">
                    <CardContent className="py-12 text-center">
                      <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-400">Fix critical issues before committing</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        {criticalCount} prize(s) have critical errors (inactive category or internal error). 
                        Review the debug report and fix these issues before you can commit.
                      </p>
                    </CardContent>
                  </Card>
                );
              }

              if (unfilledCount > 0) {
                return (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                      <div className="flex items-center justify-center gap-2">
                        <h3 className="text-lg font-semibold">Ready with unfilled prizes</h3>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 text-left">
                            <p className="text-sm font-medium mb-2">Why are some prizes unfilled?</p>
                            <ul className="text-xs text-muted-foreground space-y-1.5">
                              <li><strong>No eligible players:</strong> The category criteria (age, rating, gender, location, etc.) don't match any imported players.</li>
                              <li><strong>One-prize policy:</strong> All eligible players already won a higher-value prize. Each player can only win one prize.</li>
                              <li><strong>Too strict criteria:</strong> The category rules are too narrow for the player pool.</li>
                            </ul>
                            <p className="text-xs text-muted-foreground mt-2">
                              Check the Allocation Debug Report for detailed diagnostics.
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {filledCount} of {totalPrizes} prizes have winners. {unfilledCount} prize(s) will be marked as "No eligible winner". You can still commit.
                      </p>
                    </CardContent>
                  </Card>
                );
              }

              // All clear - no conflicts, no unfilled
              return (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">All Clear!</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      All {totalPrizes > 0 ? totalPrizes : summaryCounts.activePrizes} prizes have eligible winners.
                    </p>
                  </CardContent>
                </Card>
              );
            })()}

            <Card>
              <Collapsible open={winnersExpanded} onOpenChange={setWinnersExpanded}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer">
                    <CardTitle>Winners ({winners.length})</CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    {winners.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">No winners allocated yet.</div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3 p-4">
                          {winners.map(winner => {
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

            {summaryCounts.unfilled > 0 && (
              <Card>
                <CardHeader><CardTitle>Unfilled Prizes ({summaryCounts.unfilled})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-3 p-4">
                      {unfilled.map(entry => {
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
