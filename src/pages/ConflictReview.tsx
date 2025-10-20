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

  const { data: ruleConfig } = useQuery({
    queryKey: ['rule-config', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('rule_config').select('*').eq('tournament_id', id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id
  });

  const { data: players } = useQuery({
    queryKey: ['players', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('*').eq('tournament_id', id).order('rank');
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
      const { data, error } = await supabase.functions.invoke('allocatePrizes', {
        body: { tournamentId: id, ruleConfigOverride: ruleOverride || undefined }
      });
      if (error) throw error;
      return data as { winners: Winner[], conflicts: Conflict[] };
    },
    onSuccess: (data) => {
      setWinners(data.winners);
      setConflicts(data.conflicts);
      toast.info(data.conflicts.length === 0 ? 'All clear!' : `${data.conflicts.length} conflicts found`);
    },
    onError: async (err: any) => {
      const msg = (err?.context?.error?.message) || (err?.message) || 'Allocation failed';
      console.error('[allocatePrizes] error', err);
      toast.error(`Allocation failed: ${msg}`);
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
    const newWinners = [...winners];
    conflicts.forEach(conflict => {
      if (conflict.suggested) {
        const idx = newWinners.findIndex(w => w.prizeId === conflict.suggested!.prizeId);
        if (idx !== -1) newWinners.splice(idx, 1);
        newWinners.push({ prizeId: conflict.suggested.prizeId, playerId: conflict.suggested.playerId, reasons: ['suggested_resolution'], isManual: false });
      }
    });
    setWinners(newWinners);
    setConflicts([]);
    toast.success('All conflicts resolved');
  };

  const handleOverride = () => {
    if (!selectedConflict || !selectedPrize || !selectedPlayer) return;
    setConflicts(prev => prev.filter(c => c.id !== selectedConflict.id));
    setWinners(prev => [...prev.filter(w => w.prizeId !== selectedPrize), { prizeId: selectedPrize, playerId: selectedPlayer, reasons: ['manual_override'], isManual: true }]);
    toast.success('Override applied');
    setOverrideDrawerOpen(false);
  };

  const allPrizes = categories?.flatMap(c => c.prizes || []) || [];
  const getPlayer = (playerId: string) => players?.find(p => p.id === playerId);
  const getPrize = (prizeId: string) => allPrizes.find(p => p.id === prizeId);

  return (
    <div className="min-h-screen bg-background">
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
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {conflicts.map(conflict => (
                      <Card key={conflict.id} className="cursor-pointer" onClick={() => setSelectedConflict(conflict)}>
                        <CardHeader><CardTitle className="text-base">{conflict.type}</CardTitle></CardHeader>
                        <CardContent>
                          <div className="flex gap-2 mt-3">
                            {conflict.suggested && <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAccept(conflict.id); }}>Accept</Button>}
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setSelectedConflict(conflict); setOverrideDrawerOpen(true); }}>Override</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
            <div><Card><CardHeader><CardTitle>Summary</CardTitle></CardHeader><CardContent><div>Winners: {winners.length}</div><div>Conflicts: {conflicts.length}</div></CardContent></Card></div>
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
          }} disabled={conflicts.length > 0}>Finalize <ArrowRight className="h-4 w-4 ml-2" /></Button>
        </div>
      </div>

      <Sheet open={overrideDrawerOpen} onOpenChange={setOverrideDrawerOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Manual Override</SheetTitle></SheetHeader>
          {selectedConflict && <div className="space-y-6 mt-6">
            <div><Label>Prize</Label><Select value={selectedPrize} onValueChange={setSelectedPrize}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedConflict.impacted_prizes.map(pid => <SelectItem key={pid} value={pid}>{getPrize(pid)?.place}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Player</Label><Select value={selectedPlayer} onValueChange={setSelectedPlayer}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectedConflict.impacted_players.map(pid => <SelectItem key={pid} value={pid}>{getPlayer(pid)?.name}</SelectItem>)}</SelectContent></Select></div>
            <Button className="w-full" onClick={handleOverride}>Apply</Button>
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
