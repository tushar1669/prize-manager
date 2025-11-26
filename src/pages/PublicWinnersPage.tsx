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
import { byMainOrderPlace } from "@/utils/sortWinners";
import { getLatestAllocations } from "@/utils/getLatestAllocations";

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
        if (!tournament?.id) return { rows: [], version: null };
        if (tournament.is_published === false) {
          console.log('[public-winners] gated (unpublished)');
          toast({
            variant: 'destructive',
            title: 'Tournament unpublished',
            description: 'This tournament is not yet published. Winners cannot be shown.',
          });
          return { rows: [], version: null };
        }

      const { allocations, version } = await getLatestAllocations(tournament.id);

      if (!allocations || allocations.length === 0) {
        return { rows: [], version };
      }

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
      
      console.log('[public-winners] comparator: main→order_idx→place');
      const sorted = deduplicated.sort(byMainOrderPlace);

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
          return { rows: [], version };
        }

        return { rows: sorted, version };
    },
    enabled: !!tournament?.id,
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

  const totalPrizes = results?.rows?.length || 0;
  const totalCash = results?.rows?.reduce((sum, r) => sum + Number(r.cashAmount || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="container mx-auto px-4 py-8 pm-print-page print:px-4 print:py-3">
        <Card className="mb-6 bg-card border-border print:border-black print:bg-white">
          <CardHeader className="print:pb-2">
            <CardTitle className="text-3xl font-bold text-foreground print:text-2xl print:text-black">{tournament.title}</CardTitle>
            <div className="text-base text-muted-foreground space-y-1 print:text-sm print:text-black/70">
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
              <div className="flex gap-4 mb-4 print:mb-2">
                <Badge variant="outline" className="text-base px-4 py-1.5 border-border print:border-black print:text-sm print:text-black">
                  {totalPrizes} Winners
                </Badge>
                {totalCash > 0 && (
                  <Badge variant="outline" className="text-base px-4 py-1.5 border-border print:border-black print:text-sm print:text-black">
                    ₹{totalCash.toLocaleString('en-IN')} Total Prize
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {tournament.is_published && (
          <Card className="bg-card border-border print:border-black print:bg-white">
            <CardHeader className="print:pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-2xl font-bold text-foreground print:text-lg print:text-black">Winners</CardTitle>
                {typeof results?.version === 'number' && (
                  <Badge variant="outline" className="text-xs border-border print:border-black print:text-black">Allocations v{results.version}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="print:px-2">
            {!results?.rows || results.rows.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 print:text-black/70">
                No winners allocated yet
              </div>
            ) : (
              <Table className="print:text-[11px]">
                <TableHeader className="print:bg-black/5">
                  <TableRow className="border-border print:border-black">
                    <TableHead className="w-16 text-base print:text-black print:text-[11px]">Place</TableHead>
                    <TableHead className="text-base print:text-black print:text-[11px]">Category</TableHead>
                    <TableHead className="text-base print:text-black print:text-[11px]">Player</TableHead>
                    <TableHead className="w-20 text-base print:text-black print:text-[11px]">SNo</TableHead>
                    <TableHead className="w-20 text-base print:text-black print:text-[11px]">Rank</TableHead>
                    <TableHead className="text-base print:text-black print:text-[11px]">Club</TableHead>
                    <TableHead className="w-24 text-base print:text-black print:text-[11px]">State</TableHead>
                    <TableHead className="w-32 text-right text-base print:text-black print:text-[11px]">Prize</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.rows.map((result, idx) => (
                    <TableRow key={idx} className="border-border print:border-black/20">
                      <TableCell className="font-bold text-base text-foreground print:text-[11px] print:text-black">{result.place}</TableCell>
                      <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{result.categoryName}</TableCell>
                      <TableCell className="font-semibold text-base text-foreground print:text-[11px] print:text-black">{result.playerName}</TableCell>
                      <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{result.sno || '—'}</TableCell>
                      <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{result.rank || '—'}</TableCell>
                      <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{result.club || '—'}</TableCell>
                      <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{result.state || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 print:gap-1">
                          {result.hasTrophy && <Trophy className="h-5 w-5 text-accent print:h-3 print:w-3 print:text-black" />}
                          {result.hasMedal && <Medal className="h-5 w-5 text-success print:h-3 print:w-3 print:text-black" />}
                          {result.cashAmount > 0 && (
                            <span className="font-bold text-base text-success print:text-[11px] print:text-black">
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

        <div className="mt-6 text-center text-sm text-muted-foreground print:hidden">
          <Link to="/" className="hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
