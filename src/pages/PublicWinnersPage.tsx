import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeSelectPlayersByIds } from "@/utils/safeSelectPlayers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

export default function PublicWinnersPage() {
  const { id } = useParams();

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['public-tournament-by-id', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, city, is_published')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        console.log(`[public-winners] Loaded tournament id=${id}`);
      }
      return data;
    },
    enabled: !!id,
  });

  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['public-winners', tournament?.id],
    queryFn: async () => {
      if (!tournament?.id) return [];
      
      // Gate: only fetch if published
      if (tournament.is_published === false) {
        console.log('[public-winners] gated (unpublished)');
        return [];
      }

      const { data: allocations, error: allocError } = await supabase
        .from('allocations')
        .select('player_id, prize_id')
        .eq('tournament_id', tournament.id);
      
      if (allocError) throw allocError;
      if (!allocations || allocations.length === 0) return [];

      // De-duplicate IDs before queries
      const playerIds = [...new Set(allocations.map(a => a.player_id).filter(Boolean) as string[])];
      const prizeIds = [...new Set(allocations.map(a => a.prize_id).filter(Boolean) as string[])];
      
      console.log('[public-winners] de-duped ids', { 
        players: playerIds.length, 
        prizes: prizeIds.length,
        allocations: allocations.length 
      });

      const { data: players } = await safeSelectPlayersByIds(
        playerIds,
        ['id', 'name', 'rank', 'sno', 'club', 'state']
      );
      const { data: prizes, error: prizeError } = await supabase
        .from('prizes')
        .select('id, place, cash_amount, has_trophy, has_medal, category_id')
        .in('id', prizeIds);
      
      if (prizeError) throw prizeError;

      const categoryIds = [...new Set(prizes?.map(p => p.category_id) || [])];
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, name, is_main, order_idx')
        .in('id', categoryIds);
      
      if (catError) throw catError;

      const combined = allocations.map(alloc => {
        const player = players?.find(p => p.id === alloc.player_id);
        const prize = prizes?.find(p => p.id === alloc.prize_id);
        const category = categories?.find(c => c.id === prize?.category_id);

        return {
          prize_id: alloc.prize_id,
          playerName: player?.name || 'Unknown',
          sno: player?.sno,
          rank: player?.rank || 0,
          club: player?.club,
          state: player?.state,
          categoryName: category?.name || 'Unknown',
          isMain: category?.is_main || false,
          orderIdx: category?.order_idx ?? null,
          place: prize?.place || 0,
          cashAmount: prize?.cash_amount || 0,
          hasTrophy: prize?.has_trophy || false,
          hasMedal: prize?.has_medal || false,
        };
      });

      const uniqueByPrize = (rows: any[]) => {
        const seen = new Set<string>();
        return rows.filter(r => {
          const key = String(r.prize_id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const deduplicated = uniqueByPrize(combined);
      
      const sorted = deduplicated.sort((a, b) => {
        if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;         // Main first
        const oa = Number.isFinite(a.orderIdx) ? a.orderIdx : 999;   // brochure order
        const ob = Number.isFinite(b.orderIdx) ? b.orderIdx : 999;
        if (oa !== ob) return oa - ob;
        return (a.place || 0) - (b.place || 0);                      // then place
      });

      console.log('[public-winners] sorted main-first, order_idx, place', { count: sorted.length });

      if (!tournament.is_published && sorted.length > 0) {
        console.warn('[public-winners] received winners for unpublished tournament', {
          tournamentId: tournament.id,
          count: sorted.length,
        });
        toast({
          variant: 'destructive',
          title: 'Tournament unpublished',
          description: 'This tournament is not yet published. Winners cannot be shown.',
        });
        return [];
      }

      return sorted;
    },
    enabled: !!(tournament?.id && tournament?.is_published),
  });

  if (tournamentLoading || resultsLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Tournament not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const totalPrizes = results?.length || 0;
  const totalCash = results?.reduce((sum, r) => sum + Number(r.cashAmount || 0), 0) || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">{tournament.title}</CardTitle>
          <div className="text-sm text-muted-foreground space-y-1">
            {tournament.city && <div>{tournament.city}</div>}
            {tournament.start_date && (
              <div>
                {tournament.start_date}
                {tournament.end_date && tournament.end_date !== tournament.start_date && ` – ${tournament.end_date}`}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!tournament.is_published && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>This tournament is not yet published</AlertDescription>
            </Alert>
          )}
          
          {tournament.is_published && (
            <div className="flex gap-4 mb-4">
              <Badge variant="outline" className="text-base px-3 py-1">
                {totalPrizes} Winners
              </Badge>
              {totalCash > 0 && (
                <Badge variant="outline" className="text-base px-3 py-1">
                  ₹{totalCash.toLocaleString('en-IN')} Total Prize
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {tournament.is_published && (
        <Card>
          <CardHeader>
            <CardTitle>Winners</CardTitle>
          </CardHeader>
          <CardContent>
            {!results || results.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No winners allocated yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Place</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="w-20">SNo</TableHead>
                    <TableHead className="w-20">Rank</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead className="w-24">State</TableHead>
                    <TableHead className="w-32 text-right">Prize</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{result.place}</TableCell>
                      <TableCell>{result.categoryName}</TableCell>
                      <TableCell>{result.playerName}</TableCell>
                      <TableCell>{result.sno || '—'}</TableCell>
                      <TableCell>{result.rank || '—'}</TableCell>
                      <TableCell>{result.club || '—'}</TableCell>
                      <TableCell>{result.state || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {result.hasTrophy && <Trophy className="h-4 w-4 text-amber-600" />}
                          {result.hasMedal && <Medal className="h-4 w-4 text-slate-600" />}
                          {result.cashAmount > 0 && (
                            <span className="font-medium">
                              ₹{Number(result.cashAmount).toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/" className="hover:underline">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
