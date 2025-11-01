import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Calendar, MapPin, ExternalLink, FileText } from "lucide-react";
import { Link } from "react-router-dom";

export default function PublicTournament() {
  const { slug } = useParams();

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['public-tournament', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('published_tournaments')
        .select('id, title, start_date, end_date, city, venue, notes, public_slug, brochure_url, chessresults_url, public_results_url, slug, version')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        console.log(`[public] anon fetch ok slug=${slug}`);
      }
      return data;
    },
    enabled: !!slug,
  });

  const { data: hasResults } = useQuery({
    queryKey: ['tournament-has-results', tournament?.id],
    queryFn: async () => {
      if (!tournament?.id) return false;
      
      const { count, error } = await supabase
        .from('allocations')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id);
      
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!tournament?.id,
  });

  if (isLoading) {
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

  const showFinalRanks = tournament.public_results_url || hasResults;

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
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-foreground mb-3">
                  {tournament.title}
                </h1>
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {new Date(tournament.start_date).toLocaleDateString()} - {new Date(tournament.end_date).toLocaleDateString()}
                    </span>
                  </div>
                  {tournament.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{tournament.venue ? `${tournament.venue}, ` : ''}{tournament.city}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Card className="bg-card">
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-2">
                  {tournament.brochure_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={tournament.brochure_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Brochure
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  
                  {tournament.chessresults_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={tournament.chessresults_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        ChessResults
                      </a>
                    </Button>
                  )}
                  
                  {showFinalRanks && (
                    <Button variant="default" size="sm" asChild>
                      {tournament.public_results_url ? (
                        <a href={tournament.public_results_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                          Final Ranks
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <Link to={`/p/${slug}/results`} className="gap-2">
                          Final Ranks
                        </Link>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {tournament.notes && (
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-xl font-bold text-foreground mb-3">About</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{tournament.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
