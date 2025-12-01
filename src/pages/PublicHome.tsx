import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink, Trophy, FileText, Clock, User, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { classifyTimeControl, type TimeControlCategory } from "@/utils/timeControl";

type PublicTournament = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venue: string | null;
  public_slug: string;
  brochure_url: string | null;
  chessresults_url: string | null;
  public_results_url: string | null;
  created_at: string | null;
  time_control_base_minutes: number | null;
  time_control_increment_seconds: number | null;
  time_control_category: TimeControlCategory | null;
  chief_arbiter: string | null;
  tournament_director: string | null;
  entry_fee_amount: number | null;
  cash_prize_total: number | null;
};

const badgeVariants: Record<Exclude<TimeControlCategory, "UNKNOWN">, BadgeProps["variant"]> = {
  BLITZ: "destructive",
  RAPID: "default",
  CLASSICAL: "secondary",
};

function formatDate(dateString: string | null) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return null;
}

function formatTimeControl(base: number | null | undefined, inc: number | null | undefined) {
  if (!base && !inc) return null;
  if (!base) return `+${inc}`;
  if (!inc) return `${base}`;
  return `${base} + ${inc}`;
}

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return null;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default function PublicHome() {
  const { data: tournaments, isLoading, error, refetch } = useQuery({
    queryKey: ['public-tournaments'],
    queryFn: async (): Promise<PublicTournament[]> => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, city, venue, public_slug, brochure_url, chessresults_url, public_results_url, created_at, time_control_base_minutes, time_control_increment_seconds, time_control_category, chief_arbiter, tournament_director, entry_fee_amount, cash_prize_total')
        .eq('is_published', true)
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as unknown as PublicTournament[]) ?? [];
    },
  });

  const tournamentList: PublicTournament[] = tournaments ?? [];

  const { data: allocationsMap } = useQuery({
    queryKey: ['allocations-map'],
    queryFn: async () => {
      if (!tournamentList || tournamentList.length === 0) return {};

      const tournamentIds = tournamentList.map(t => t.id);
      const { data, error } = await supabase
        .from('allocations')
        .select('tournament_id, version')
        .in('tournament_id', tournamentIds)
        .order('version', { ascending: false });

      if (error) throw error;

      const map: Record<string, boolean> = {};
      data?.forEach(a => {
        if (map[a.tournament_id]) return;
        map[a.tournament_id] = true;
      });
      return map;
    },
    enabled: !!tournamentList && tournamentList.length > 0,
  });

  // Helper function for rendering time control - must be defined before early returns
  const renderTimeControl = (t: PublicTournament) => {
    const formatted = formatTimeControl(t.time_control_base_minutes, t.time_control_increment_seconds);
    const categoryFromFields = t.time_control_category && t.time_control_category !== "UNKNOWN" ? t.time_control_category : null;
    const classified = classifyTimeControl(t.time_control_base_minutes, t.time_control_increment_seconds);
    const category = categoryFromFields ?? (classified !== "UNKNOWN" ? classified : null);

    if (!formatted && !category) return null;

    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <div className="flex items-center gap-2">
          {category && badgeVariants[category as Exclude<TimeControlCategory, "UNKNOWN">] && (
            <Badge variant={badgeVariants[category as Exclude<TimeControlCategory, "UNKNOWN">]} className="text-[10px] tracking-wide">
              {category}
            </Badge>
          )}
          {formatted && <span className="font-medium text-foreground">{formatted}</span>}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-destructive">Unable to load tournaments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Please check your internet connection or try again in a few minutes.
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
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
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl font-bold text-foreground mb-4">Tournament Results</h1>
              <p className="text-lg text-muted-foreground">
                View published tournament results and prize allocations
              </p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-6 py-12">
          <div className="max-w-5xl mx-auto grid grid-cols-1 gap-6">
            {!tournamentList || tournamentList.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No published tournaments yet.
                </CardContent>
              </Card>
            ) : (
              tournamentList.map((tournament) => {
                const hasInternalResults = allocationsMap?.[tournament.id];
                const showFinalRanks = tournament.public_results_url || hasInternalResults;
                const dateRange = formatDateRange(tournament.start_date, tournament.end_date);
                const location = [tournament.city, tournament.venue].filter(Boolean).join(" • ") || null;
                const entryFee = formatCurrency(tournament.entry_fee_amount);
                const cashPrize = formatCurrency(tournament.cash_prize_total);

                return (
                  <Card
                    key={tournament.id}
                    className="group relative flex flex-col justify-between rounded-2xl border bg-card/60 p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg hover:border-primary/40"
                  >
                    <CardHeader className="space-y-2 p-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <CardTitle className="text-xl font-semibold leading-tight text-foreground">{tournament.title}</CardTitle>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {(dateRange || tournament.start_date) && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>{dateRange ?? "—"}</span>
                              </div>
                            )}
                            {location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                <span>{location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[11px] uppercase tracking-wide">Published</Badge>
                      </div>
                      {renderTimeControl(tournament)}
                    </CardHeader>

                    <CardContent className="p-0 pt-4 space-y-2 text-sm text-muted-foreground">
                      {tournament.chief_arbiter && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>
                            <span className="font-medium text-foreground">Chief Arbiter:</span> {tournament.chief_arbiter}
                          </span>
                        </div>
                      )}
                      {tournament.tournament_director && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>
                            <span className="font-medium text-foreground">Tournament Director:</span> {tournament.tournament_director}
                          </span>
                        </div>
                      )}
                      {entryFee && (
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4" />
                          <span>
                            <span className="font-medium text-foreground">Entry Fee:</span> {entryFee}
                          </span>
                        </div>
                      )}
                      {cashPrize && (
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4" />
                          <span>
                            <span className="font-medium text-foreground">Total Cash Prize:</span> {cashPrize}
                          </span>
                        </div>
                      )}

                      <div className="pt-4 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild className="group-hover:border-primary/60 group-hover:text-primary">
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
    </>
  );
}
