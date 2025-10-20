import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileDown, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Winner {
  prizeId: string;
  playerId: string;
  reasons: string[];
  isManual: boolean;
}

export default function Finalize() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const winners = (location.state?.winners || []) as Winner[];

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
      if (!id) {
        toast.error('Tournament ID missing');
        navigate('/dashboard');
        return;
      }
      navigate(`/t/${id}/publish`, { state: { version: data.version } });
    },
    onError: (error: any) => {
      console.error('[finalize]', error);
      toast.error(`Finalization failed: ${error.message}`);
    }
  });

  const handleExportPDF = () => {
    toast.info("PDF export coming in Phase-3");
  };

  const handleExportCSV = () => {
    toast.info("CSV export coming in Phase-3");
  };

  const handlePublish = () => {
    if (winners.length === 0) {
      toast.error("No allocations to finalize");
      return;
    }
    finalizeMutation.mutate(winners);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">Finalize Allocations</h1>
            <span className="text-xs rounded-full px-2 py-1 bg-muted">
              v{nextVersion ?? 1}
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

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleExportPDF}
                variant="outline"
                className="w-full justify-between"
                disabled
              >
                <span className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  Download PDF Report
                </span>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="w-full justify-between"
                disabled
              >
                <span className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  Download CSV Export
                </span>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Export features coming in Phase-3
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4">
                By publishing, you create an immutable version (v{nextVersion ?? 1}) of these allocations.
                The tournament will be available at a public URL that can be shared with participants.
              </p>
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
