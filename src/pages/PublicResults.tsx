import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrochureLink } from "@/components/public/BrochureLink";
import { PublicTeamPrizesSection } from "@/components/public/PublicTeamPrizesSection";
import { PublicBackButton } from "@/components/public/PublicBackButton";
import { PublicHeader } from "@/components/public/PublicHeader";

type PublishedTournamentBasic = {
  id: string;
  title: string;
  slug: string;
  brochure_url: string | null;
};

interface PublicResultRow {
  prize_id: string;
  player_name: string;
  rank: number;
  rating: number | null;
  state: string | null;
  category_name: string;
  is_main: boolean;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  has_full_access?: boolean;
  other_categories_locked?: boolean;
}

export default function PublicResults() {
  const { slug } = useParams();

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['public-tournament', slug],
    queryFn: async (): Promise<PublishedTournamentBasic | null> => {
      // Try indexed slug columns first (publication_slug or public_slug)
      const { data: indexedData, error: indexedError } = await supabase
        .from('published_tournaments')
        .select('id, title, slug, brochure_url')
        .or(`publication_slug.eq.${slug},public_slug.eq.${slug}`)
        .maybeSingle();

      if (indexedError) throw indexedError;
      if (indexedData) {
        console.log(`[public] anon fetch ok slug=${slug} (indexed)`);
        return indexedData as unknown as PublishedTournamentBasic | null;
      }

      // Fallback to computed slug column
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('published_tournaments')
        .select('id, title, slug, brochure_url')
        .eq('slug', slug as string)
        .maybeSingle();

      if (fallbackError) throw fallbackError;
      if (fallbackData) {
        console.log(`[public] anon fetch ok slug=${slug} (fallback)`);
      }
      return fallbackData as unknown as PublishedTournamentBasic | null;
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  const { data: results, isLoading: resultsLoading } = useQuery({
    queryKey: ['public-results', tournament?.id],
    queryFn: async () => {
      if (!tournament?.id) return { rows: [], hasFullAccess: false, otherCategoriesLocked: false };

      const { data, error } = await (supabase.rpc as Function)(
        'get_public_tournament_results',
        { tournament_id: tournament.id }
      ) as { data: PublicResultRow[] | null; error: Error | null };

      if (error) throw error;

      const typedData = (data || []) as PublicResultRow[];

      const rows = typedData.map((row) => ({
        prize_id: row.prize_id,
        playerName: row.player_name || 'Unknown',
        rank: row.rank || 0,
        rating: row.rating,
        state: row.state,
        categoryName: row.category_name || 'Unknown',
        isMain: !!row.is_main,
        place: row.place || 0,
        cashAmount: row.cash_amount || 0,
        hasTrophy: !!row.has_trophy,
        hasMedal: !!row.has_medal,
      }));

      return {
        rows,
        hasFullAccess: typedData[0]?.has_full_access ?? false,
        otherCategoriesLocked: typedData[0]?.other_categories_locked ?? false,
      };
    },
    enabled: !!tournament?.id,
    staleTime: 60_000,
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
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="bg-gradient-to-br from-primary/20 via-secondary/10 to-background border-b border-border">
          <div className="container mx-auto px-6 py-12">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <PublicBackButton />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-bold text-foreground mb-2">{tournament.title}</h1>
                  <p className="text-lg text-muted-foreground">Final Results</p>
                </div>
                <div className="flex items-center gap-2">
                  <BrochureLink url={tournament.brochure_url} />
                  <Button variant="outline" asChild>
                    <Link to={`/p/${slug}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Details
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            {!results?.rows || results.rows.length === 0 ? (
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
                        {results.rows.map((result, idx) => (
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

            {results?.otherCategoriesLocked && (
              <Card className="mt-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <CardContent className="pt-4 text-center text-sm text-amber-800 dark:text-amber-200">
                  Some categories are hidden. Full results are available for Pro tournaments.
                </CardContent>
              </Card>
            )}

            {/* Team Prizes Section */}
            {tournament?.id && (
              <PublicTeamPrizesSection tournamentId={tournament.id} />
            )}
          </div>
        </div>
    </div>
    </>
  );
}
