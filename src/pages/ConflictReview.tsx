import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BackBar } from "@/components/BackBar";

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

export default function ConflictReview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [winners, setWinners] = useState<Winner[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [overrideDrawerOpen, setOverrideDrawerOpen] = useState(false);
  const [selectedPrize, setSelectedPrize] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");

  // Fetch scoped players and prizes for this tournament
  const { data: playersList } = useQuery({
    queryKey: ['players-list', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, dob, rating')
        .eq('tournament_id', id)
        .order('rank', { ascending: true, nullsFirst: false });
      if (error) throw error;
      console.log('[review] players:', data?.length || 0);
      return data || [];
    },
    enabled: !!id
  });

  const { data: prizesList } = useQuery({
    queryKey: ['prizes-list', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, prizes(id, place, cash_amount, has_trophy, has_medal)')
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

  const { data: players } = useQuery({
    queryKey: ['players', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('id, name, rank, rating, dob, gender, club, state, tournament_id').eq('tournament_id', id).order('rank');
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const { data: categories } = useQuery({
    queryKey: ['categories-prizes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*, prizes(*)').eq('tournament_id', id);
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const allocateMutation = useMutation({
    mutationFn: async (ruleOverride?: any) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      console.log('[allocatePrizes] invoking with:', {
        tournamentId: id,
        playersCount: playersList?.length || 0,
        prizesCount: prizesList?.length || 0,
        ruleConfigOverride: ruleOverride || null
      });
      
      const { data, error } = await supabase.functions.invoke('allocatePrizes', {
        body: { tournamentId: id, ruleConfigOverride: ruleOverride || undefined },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (error) throw error;
      
      console.log('[allocatePrizes] result:', data);
      return data as { winners: Winner[], conflicts: Conflict[], meta?: { playerCount?: number, prizeCount?: number, categoryCount?: number } };
    },
    onSuccess: (data) => {
      setWinners(data.winners);
      setConflicts(data.conflicts);
      console.log('[review] players:', playersList?.length || 0, 'prizes:', prizesList?.length || 0, 'winners:', data.winners.length, 'conflicts:', data.conflicts.length);
      toast.info(data.conflicts.length === 0 ? 'All clear!' : `${data.conflicts.length} conflicts found`);
    },
    onError: (err: any) => {
      console.error('[allocatePrizes] error', err);
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
    if (id) allocateMutation.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAccept = (conflictId: string) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict?.suggested) return;

    setWinners(prev => [
      ...prev.filter(w => w.prizeId !== conflict.suggested!.prizeId),
      { prizeId: conflict.suggested!.prizeId, playerId: conflict.suggested!.playerId, reasons: ['suggested_resolution'], isManual: false }
    ]);
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    toast.success('Conflict resolved');
  };

  const handleAcceptAll = () => {
    let resolved = 0;
    const newWinners = [...winners];
    const newConflicts = [...conflicts];

    // Greedy resolution: accept non-overlapping conflicts
    const processedPrizes = new Set<string>();
    const processedPlayers = new Set<string>();

    conflicts.forEach(conflict => {
      if (conflict.suggested) {
        const { prizeId, playerId } = conflict.suggested;
        // Only accept if prize and player haven't been processed
        if (!processedPrizes.has(prizeId) && !processedPlayers.has(playerId)) {
          const idx = newWinners.findIndex(w => w.prizeId === prizeId);
          if (idx !== -1) newWinners.splice(idx, 1);
          newWinners.push({ prizeId, playerId, reasons: ['suggested_resolution'], isManual: false });
          processedPrizes.add(prizeId);
          processedPlayers.add(playerId);
          resolved++;
        }
      }
    });

    // Remove resolved conflicts
    const remainingConflicts = newConflicts.filter(c => 
      !c.suggested || 
      processedPrizes.has(c.suggested.prizeId) === false
    );

    setWinners(newWinners);
    setConflicts(remainingConflicts);
    toast.success(`Resolved ${resolved} conflicts automatically`);
  };

  const handleOverride = () => {
    if (!selectedConflict || !selectedPrize || !selectedPlayer) {
      toast.error('Please select both a prize and a player');
      return;
    }
    
    // Remove conflicts that reference this prize or player
    setConflicts(prev => prev.filter(c => 
      !c.impacted_prizes.includes(selectedPrize) && 
      !c.impacted_players.includes(selectedPlayer)
    ));
    
    // Update winners
    setWinners(prev => [
      ...prev.filter(w => w.prizeId !== selectedPrize), 
      { prizeId: selectedPrize, playerId: selectedPlayer, reasons: ['manual_override'], isManual: true }
    ]);
    
    toast.success('Override applied');
    setOverrideDrawerOpen(false);
    setSelectedPrize("");
    setSelectedPlayer("");
  };

  const getPlayer = (playerId: string) => playersList?.find(p => p.id === playerId);
  const getPrize = (prizeId: string) => prizesList?.find(p => p.id === prizeId);

  return (
    <div className="min-h-screen bg-background">
      <BackBar label="Back to Import" to={`/t/${id}/import`} />
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Review Allocations</h1>
          {conflicts.length > 0 && <Badge variant="destructive">{conflicts.length} Conflicts</Badge>}
        </div>

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
                      <Button size="sm" onClick={handleAcceptAll}>
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
                                <Badge variant={conflict.type === 'multi-eligibility' ? 'default' : conflict.type === 'equal-value' ? 'secondary' : 'destructive'}>
                                  {conflict.type}
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
                                {conflict.reasons.join(', ')}
                              </p>
                              <div className="flex gap-2 mt-3">
                                {conflict.suggested && <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAccept(conflict.id); }}>Accept</Button>}
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedConflict(conflict); setOverrideDrawerOpen(true); }}>Override</Button>
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
            <div>
              <Card>
                <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    <strong>Players:</strong> {playersList?.length || 0}
                  </div>
                  <div className="text-sm">
                    <strong>Prizes:</strong> {prizesList?.length || 0}
                  </div>
                  <div className="text-sm">
                    <strong>Winners:</strong> {winners.length}
                  </div>
                  <div className="text-sm">
                    <strong>Conflicts:</strong> {conflicts.length}
                  </div>
                </CardContent>
              </Card>
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
          <Button onClick={() => {
            if (!id) {
              toast.error('Tournament ID missing');
              navigate('/dashboard');
              return;
            }
            navigate(`/t/${id}/finalize`, { state: { winners } });
          }} disabled={conflicts.length > 0 || winners.length === 0} title={conflicts.length > 0 ? 'Resolve all conflicts before finalizing' : winners.length === 0 ? 'No winners to finalize' : ''}>
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
                      {player.name} (Rating: {player.rating || 'N/A'}, DOB: {player.dob || 'N/A'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleOverride} disabled={!selectedPrize || !selectedPlayer}>
              Apply Override
            </Button>
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
