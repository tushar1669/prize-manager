import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink, Trophy, FileText } from "lucide-react";
import { Link } from "react-router-dom";

export default function PublicHome() {
  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['public-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, city, venue, public_slug, brochure_url, chessresults_url, public_results_url')
        .eq('is_published', true)
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: allocationsMap } = useQuery({
    queryKey: ['allocations-map'],
    queryFn: async () => {
      if (!tournaments || tournaments.length === 0) return {};
      
      const tournamentIds = tournaments.map(t => t.id);
      const { data, error } = await supabase
        .from('allocations')
        .select('tournament_id')
        .in('tournament_id', tournamentIds);
      
      if (error) throw error;
      
      const map: Record<string, boolean> = {};
      data?.forEach(a => {
        map[a.tournament_id] = true;
      });
      return map;
    },
    enabled: !!tournaments && tournaments.length > 0,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-br from-primary/20 via-secondary/10 to-background border-b border-border">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-bold text-foreground mb-4">Tournament Results</h1>
            <p className="text-lg text-muted-foreground">
              View published tournament results and prize allocations
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {!tournaments || tournaments.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No published tournaments yet.
              </CardContent>
            </Card>
          ) : (
            tournaments.map((tournament) => {
              const hasInternalResults = allocationsMap?.[tournament.id];
              const showFinalRanks = tournament.public_results_url || hasInternalResults;

              return (
                <Card key={tournament.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-2xl mb-2">{tournament.title}</CardTitle>
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {new Date(tournament.start_date).toLocaleDateString()} - {new Date(tournament.end_date).toLocaleDateString()}
                            </span>
                          </div>
                          {tournament.city && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>{tournament.city}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/p/${tournament.public_slug}`} className="gap-2">
                          <Trophy className="h-4 w-4" />
                          View Details
                        </Link>
                      </Button>
                      
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
                        <Button variant="outline" size="sm" asChild>
                          {tournament.public_results_url ? (
                            <a href={tournament.public_results_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                              Final Ranks
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <Link to={`/p/${tournament.public_slug}/results`} className="gap-2">
                              Final Ranks
                            </Link>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
