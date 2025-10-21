import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal } from "lucide-react";

export default function PublicResults() {
  const { slug } = useParams();

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['public-tournament', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, is_published')
        .eq('public_slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['public-results', tournament?.id],
    queryFn: async () => {
      if (!tournament?.id) return [];

      // Fetch allocations with player and prize data
      const { data: allocations, error: allocError } = await supabase
        .from('allocations')
        .select('player_id, prize_id')
        .eq('tournament_id', tournament.id);
      
      if (allocError) throw allocError;
      if (!allocations || allocations.length === 0) return [];

      // Fetch players
      const playerIds = allocations.map(a => a.player_id);
      const { data: players, error: playerError } = await supabase
        .from('players')
        .select('id, name, rank, rating, state')
        .in('id', playerIds);
      
      if (playerError) throw playerError;

      // Fetch prizes with categories
      const prizeIds = allocations.map(a => a.prize_id);
      const { data: prizes, error: prizeError } = await supabase
        .from('prizes')
        .select('id, place, cash_amount, has_trophy, has_medal, category_id')
        .in('id', prizeIds);
      
      if (prizeError) throw prizeError;

      const categoryIds = prizes?.map(p => p.category_id) || [];
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, name, is_main')
        .in('id', categoryIds);
      
      if (catError) throw catError;

      // Combine data
      const combined = allocations.map(alloc => {
        const player = players?.find(p => p.id === alloc.player_id);
        const prize = prizes?.find(p => p.id === alloc.prize_id);
        const category = categories?.find(c => c.id === prize?.category_id);

        return {
          playerName: player?.name || 'Unknown',
          rank: player?.rank || 0,
          rating: player?.rating,
          state: player?.state,
          categoryName: category?.name || 'Unknown',
          isMain: category?.is_main || false,
          place: prize?.place || 0,
          cashAmount: prize?.cash_amount || 0,
          hasTrophy: prize?.has_trophy || false,
          hasMedal: prize?.has_medal || false,
        };
      });

      // Sort: main first, then by place
      return combined.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return a.place - b.place;
      });
    },
    enabled: !!tournament?.id,
  });

  if (tournamentLoading || resultsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Tournament not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Organizer sign in (public pages) */}
      <a
        href="/auth"
        aria-label="Organizer sign in"
        className="fixed top-4 right-4 z-50 text-sm text-zinc-300 hover:text-white underline"
        data-testid="organizer-signin-link"
      >
        Organizer sign in
      </a>

      <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-br from-primary/20 via-secondary/10 to-background border-b border-border">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold text-foreground mb-2">{tournament.title}</h1>
            <p className="text-lg text-muted-foreground">Final Results</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {!results || results.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No published results yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border bg-muted/50">
                        <TableHead className="font-semibold">Category</TableHead>
                        <TableHead className="font-semibold">Place</TableHead>
                        <TableHead className="font-semibold">Player</TableHead>
                        <TableHead className="font-semibold">Rank</TableHead>
                        <TableHead className="font-semibold">Rating</TableHead>
                        <TableHead className="font-semibold">State</TableHead>
                        <TableHead className="font-semibold">Prize</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result, idx) => (
                        <TableRow key={idx} className="border-border">
                          <TableCell className="font-medium">{result.categoryName}</TableCell>
                          <TableCell className="font-bold text-lg">{result.place}</TableCell>
                          <TableCell className="font-medium text-foreground">{result.playerName}</TableCell>
                          <TableCell className="text-muted-foreground">{result.rank}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {result.rating ?? 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{result.state || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {result.cashAmount > 0 && (
                                <span className="font-medium text-accent">₹{result.cashAmount}</span>
                              )}
                              {result.hasTrophy && <Trophy className="h-4 w-4 text-yellow-500" />}
                              {result.hasMedal && <Medal className="h-4 w-4 text-gray-400" />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
