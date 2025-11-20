import { useEffect, useRef, useState } from "react";
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
import { AlertCircle, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ALLOC_VERBOSE_LOGS } from "@/utils/featureFlags";
import { safeSelectPlayersByTournament } from "@/utils/safeSelectPlayers";
import { BackBar } from "@/components/BackBar";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IneligibilityTooltip } from "@/components/allocation/IneligibilityTooltip";
import { formatReasonCode } from "@/utils/reasonCodeLabels";

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
  const [coverageData, setCoverageData] = useState<Array<{
    categoryId: string;
    categoryName: string;
    prizeId: string;
    place: number;
    eligibleCount: number;
    pickedCount: number;
    winnerId?: string;
    reasonCodes: string[];
  }>>([]);
  const [previewCompleted, setPreviewCompleted] = useState(false);

  useEffect(() => {
    manualDecisionsRef.current = manualDecisions;
  }, [manualDecisions]);

  // Fetch scoped players and prizes for this tournament
  const { data: playersList } = useQuery({
    queryKey: ['players-list', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, count, usedColumns } = await safeSelectPlayersByTournament(
        id,
        ['id', 'name', 'dob', 'dob_raw', 'rating'],
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
      console.log('[review] prizes:', prizes.length);
      return prizes;
    },
    enabled: !!id
  });

  const { data: ruleConfig } = useQuery({
    queryKey: ['rule-config', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rule_config').select('strict_age, allow_unrated_in_rating, prefer_main_on_equal_value, prefer_category_rank_on_tie, category_priority_order, tournament_id, created_at, updated_at').eq('tournament_id', id).maybeSingle();
      if (error) throw error;
      // Provide defaults if rule_config doesn't exist yet
      return data || {
        strict_age: true,
        allow_unrated_in_rating: false,
        prefer_main_on_equal_value: true,
        prefer_category_rank_on_tie: false,
        category_priority_order: [],
        tournament_id: id,
      };
    },
    enabled: !!id
  });

  const allocateMutation = useMutation({
    mutationFn: async (options?: { ruleOverride?: any; overrides?: { prizeId: string; playerId: string }[]; dryRun?: boolean }) => {
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
        coverage?: Array<{
          categoryId: string;
          categoryName: string;
          prizeId: string;
          place: number;
          eligibleCount: number;
          pickedCount: number;
          winnerId?: string;
          reasonCodes: string[];
        }>;
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
        setCoverageData(data.coverage);
        setPreviewCompleted(true);
        console.log('[review] Preview completed, coverage:', data.coverage);
        
        const zeroEligibleCount = data.coverage.filter(c => c.eligibleCount === 0).length;
        if (zeroEligibleCount > 0) {
          toast.warning(`Preview shows ${zeroEligibleCount} prize(s) with no eligible players. Review coverage before committing.`);
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
    onError: (err: any) => {
      console.error('[allocatePrizes] error', err);
      allocTriggeredRef.current = false;
      // Check if it's a network-level failure
      if (err?.message?.includes('net::ERR_FAILED') || err?.message?.includes('Failed to fetch')) {
        toast.error('Allocation failed: Network error. Check your connection or try again.');
      } else {
        const msg = err?.context?.error?.message || err?.message || 'Unknown error';
        toast.error(`Allocation failed: ${msg}`);
      }
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
            disabled={
              !previewCompleted || 
              allocateMutation.isPending ||
              coverageData.some(c => c.eligibleCount === 0 && !c.reasonCodes.includes('already_assigned'))
            }
            variant="default"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Commit Allocation
          </Button>
        </div>

        <Alert className="mb-6 border-primary/30 bg-primary/10 text-primary">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Allocation {isPreviewMode ? 'Preview' : 'Summary'}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div><span className="font-medium">Players:</span> {summaryCounts.players}</div>
              <div><span className="font-medium">Active prizes:</span> {summaryCounts.activePrizes}</div>
              <div><span className="font-medium">Winners:</span> {summaryCounts.winners}</div>
              <div><span className="font-medium">Conflicts:</span> {summaryCounts.conflicts}</div>
              <div><span className="font-medium">Unfilled:</span> {summaryCounts.unfilled}</div>
            </div>
          </AlertDescription>
        </Alert>

        {previewCompleted && coverageData.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Allocation Coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <table className="w-full text-sm">
                  <thead className="border-b sticky top-0 bg-background">
                    <tr>
                      <th className="text-left py-2 px-3">Category</th>
                      <th className="text-left py-2 px-3">Place</th>
                      <th className="text-right py-2 px-3">Eligible</th>
                      <th className="text-right py-2 px-3">Picked</th>
                      <th className="text-left py-2 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageData.map((item, idx) => {
                      const isZeroEligible = item.eligibleCount === 0;
                      const winner = item.winnerId ? getPlayer(item.winnerId) : null;
                      
                      return (
                        <tr 
                          key={`${item.prizeId}-${idx}`}
                          className={`border-b ${isZeroEligible ? 'bg-destructive/10' : ''}`}
                        >
                          <td className="py-2 px-3 font-medium">{item.categoryName}</td>
                          <td className="py-2 px-3">{item.place}</td>
                          <td className="py-2 px-3 text-right">
                            {isZeroEligible ? (
                              <Badge variant="destructive">{item.eligibleCount}</Badge>
                            ) : (
                              <span>{item.eligibleCount}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">{item.pickedCount}</td>
                          <td className="py-2 px-3">
                            {item.pickedCount === 1 && winner ? (
                              <span className="text-xs text-muted-foreground">
                                {winner.name} (Rank {winner.rank || 'N/A'})
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {item.reasonCodes[0] ? formatReasonCode(item.reasonCodes[0]) : 'No reasons'}
                                </Badge>
                                <IneligibilityTooltip reasonCodes={item.reasonCodes} />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
              
              {coverageData.some(c => c.eligibleCount === 0) && (
                <Alert className="mt-4 border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Warning</AlertTitle>
                  <AlertDescription>
                    Some prize categories have zero eligible players. Review the coverage table to identify missing fields or restrictive criteria.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {allocateMutation.isPending ? (
          <Card><CardContent className="py-12 text-center"><RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4" /></CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {conflicts.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" /><h3 className="text-lg font-semibold">All Clear!</h3></CardContent></Card>
              ) : (
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
                          <Card key={conflict.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedConflict(conflict)}>
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
                                  <strong>Player:</strong> {player.name} (Rating: {player.rating || 'N/A'})
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
              )}
            </div>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><strong>Players:</strong> {summaryCounts.players}</div>
                  <div><strong>Active prizes:</strong> {summaryCounts.activePrizes}</div>
                  <div><strong>Winners:</strong> {summaryCounts.winners}</div>
                  <div><strong>Conflicts:</strong> {summaryCounts.conflicts}</div>
                  <div><strong>Unfilled:</strong> {summaryCounts.unfilled}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Winners ({winners.length})</CardTitle></CardHeader>
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
                                {player ? player.name : `Player ${winner.playerId}`}
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
              navigate(`/t/${id}/finalize`, { state: { winners } });
            }} 
            disabled={
              isPreviewMode ||
              !previewCompleted ||
              winners.length === 0 ||
              conflicts.length > 0
            } 
            title={
              isPreviewMode ? 'Commit allocation first' :
              !previewCompleted ? 'Run preview first' :
              conflicts.length > 0 ? 'Resolve all conflicts before finalizing' : 
              winners.length === 0 ? 'No winners to finalize' : ''
            }
          >
            Finalize <ArrowRight className="h-4 w-4 ml-2" />
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
                        {player.name} (Rating: {player.rating || 'N/A'}, DOB: {player.dob || 'N/A'})
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
