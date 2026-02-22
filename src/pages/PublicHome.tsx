import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { classifyTimeControl } from "@/utils/timeControl";
import { PublicHeader } from "@/components/public/PublicHeader";

interface PublicManualPrize {
  tournament_id: string;
  title: string;
  winner_name: string;
  sort_order: number;
}

type PublicTournament = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venue: string | null;
  public_slug: string;
  created_at: string | null;
  time_control_base_minutes: number | null;
  time_control_increment_seconds: number | null;
};

const PAGE_SIZE = 20;

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

export default function PublicHome() {
  const [tournamentList, setTournamentList] = useState<PublicTournament[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [manualPrizesMap, setManualPrizesMap] = useState<Map<string, PublicManualPrize[]>>(new Map());

  // Batch fetch manual prizes for a set of tournament IDs
  const fetchManualPrizes = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const { data, error } = await (supabase.from as any)("tournament_manual_prizes")
        .select("tournament_id,title,winner_name,sort_order")
        .in("tournament_id", ids)
        .eq("is_visible", true)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) { console.warn("[public] manual prizes fetch error", error); return; }
      const grouped = new Map<string, PublicManualPrize[]>();
      for (const row of (data ?? []) as PublicManualPrize[]) {
        const arr = grouped.get(row.tournament_id) ?? [];
        arr.push(row);
        grouped.set(row.tournament_id, arr);
      }
      setManualPrizesMap((prev) => {
        const next = new Map(prev);
        grouped.forEach((v, k) => next.set(k, v));
        return next;
      });
    } catch (err) {
      console.warn("[public] manual prizes fetch failed", err);
    }
  };

  const { data: tournaments, isLoading, error, refetch } = useQuery({
    queryKey: ['public-tournaments'],
    queryFn: async (): Promise<PublicTournament[]> => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, city, venue, public_slug, created_at, time_control_base_minutes, time_control_increment_seconds')
        .eq('is_published', true)
        .eq('is_archived', false)
        .is('deleted_at', null)
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (error) throw error;
      return (data as unknown as PublicTournament[]) ?? [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (tournaments) {
      setTournamentList(tournaments);
      setHasMore(tournaments.length === PAGE_SIZE);
      const ids = tournaments.map((t) => t.id);
      fetchManualPrizes(ids);
    }
  }, [tournaments]);

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const from = tournamentList.length;
    const to = from + PAGE_SIZE - 1;

    const { data, error: loadError } = await supabase
      .from('tournaments')
      .select('id, title, start_date, end_date, city, venue, public_slug, created_at, time_control_base_minutes, time_control_increment_seconds')
      .eq('is_published', true)
      .eq('is_archived', false)
      .is('deleted_at', null)
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (loadError) {
      setLoadMoreError("Unable to load more tournaments.");
      setIsLoadingMore(false);
      return;
    }

    const nextPage = (data as unknown as PublicTournament[]) ?? [];
    setTournamentList((prev) => [...prev, ...nextPage]);
    setHasMore(nextPage.length === PAGE_SIZE);
    setIsLoadingMore(false);

    // Fetch manual prizes for newly loaded tournaments
    const newIds = nextPage.map((t) => t.id);
    fetchManualPrizes(newIds);
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
      <div className="min-h-screen bg-background">
        <PublicHeader />
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
                const dateRange = formatDateRange(tournament.start_date, tournament.end_date);
                const location = [tournament.city, tournament.venue].filter(Boolean).join(" • ") || null;
                const timeFormat = classifyTimeControl(
                  tournament.time_control_base_minutes,
                  tournament.time_control_increment_seconds
                );
                const showFormat = timeFormat && timeFormat !== "UNKNOWN";
                return (
                  <Card
                    key={tournament.id}
                    className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/70 p-5 shadow-sm"
                  >
                    <CardHeader className="space-y-2 p-0">
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
                        {showFormat && (
                          <div className="flex items-center gap-1">
                            <Timer className="h-4 w-4" />
                            <Badge variant="secondary" className="text-xs">
                              {timeFormat}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </CardHeader>

                    {/* Manual prize chips */}
                    {(() => {
                      const mp = manualPrizesMap.get(tournament.id);
                      if (!mp || mp.length === 0) return null;
                      const shown = mp.slice(0, 3);
                      const extra = mp.length - 3;
                      return (
                        <div className="flex flex-wrap gap-1.5 px-0">
                          {shown.map((p, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-normal">
                              {p.title}: {p.winner_name}
                            </Badge>
                          ))}
                          {extra > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              +{extra} more
                            </Badge>
                          )}
                        </div>
                      );
                    })()}

                    <CardContent className="p-0">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/p/${tournament.public_slug}`} className="gap-2">
                          View Details
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
          {loadMoreError && (
            <p className="mt-6 text-center text-sm text-destructive">{loadMoreError}</p>
          )}
          {hasMore && tournamentList.length > 0 && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
