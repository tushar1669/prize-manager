import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBackButton } from "@/components/public/PublicBackButton";
import { CategoryCardsView } from "@/components/final-prize/CategoryCardsView";
import { BrochureLink } from "@/components/public/BrochureLink";
import { useFinalPrizeData } from "@/hooks/useFinalPrizeData";
import { formatCurrencyINR } from "@/utils/currency";
import { classifyTimeControl } from "@/utils/timeControl";

type TournamentDetails = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  venue?: string | null;
  city?: string | null;
  event_code?: string | null;
  notes?: string | null;
  brochure_url?: string | null;
  chessresults_url?: string | null;
  public_results_url?: string | null;
  public_slug?: string | null;
  time_control_base_minutes?: number | null;
  time_control_increment_seconds?: number | null;
  chief_arbiter?: string | null;
  tournament_director?: string | null;
  entry_fee_amount?: number | null;
  cash_prize_total?: number | null;
};

export default function PublicTournamentDetails() {
  const { slug } = useParams();
  const { data: t, isLoading, error } = useQuery({
    queryKey: ['public-tournament-details', slug],
    queryFn: async (): Promise<TournamentDetails | null> => {
      const { data, error: queryError } = await supabase
        .from("published_tournaments")
        .select([
          "id",
          "title",
          "start_date",
          "end_date",
          "venue",
          "city",
          "event_code",
          "notes",
          "brochure_url",
          "chessresults_url",
          "public_results_url",
          "public_slug",
          "time_control_base_minutes",
          "time_control_increment_seconds",
          "chief_arbiter",
          "tournament_director",
          "entry_fee_amount",
          "cash_prize_total",
        ].join(", "))
        .eq("slug", slug as string)
        .maybeSingle();

      if (queryError) throw queryError;
      return data as TournamentDetails | null;
    },
    enabled: !!slug,
  });

  const { grouped, isLoading: resultsLoading, version } = useFinalPrizeData(t?.id);

  const formatDate = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const formatDateRange = (start: string | null | undefined, end: string | null | undefined) => {
    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);
    if (startFormatted && endFormatted) return `${startFormatted} – ${endFormatted}`;
    return startFormatted ?? endFormatted ?? "—";
  };

  const timeControlLabel = (() => {
    if (!t) return null;
    const base = t.time_control_base_minutes;
    const inc = t.time_control_increment_seconds;
    if (!base && !inc) return null;
    if (!base) return `+${inc}`;
    if (!inc) return `${base}`;
    return `${base} + ${inc}`;
  })();

  const timeControlCategory = t
    ? classifyTimeControl(t.time_control_base_minutes, t.time_control_increment_seconds)
    : "UNKNOWN";

  if (isLoading || resultsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-6">
          <div className="animate-pulse">Loading tournament details…</div>
        </div>
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
        <div className="bg-gradient-to-br from-primary/20 via-secondary/10 to-background border-b border-border print:bg-white print:border-black/30">
          <div className="container mx-auto px-6 py-12">
            <div className="max-w-5xl mx-auto space-y-6">
              <PublicBackButton />
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-2 print:text-black">{t?.title ?? "Tournament Details"}</h1>
                {t && (
                  <p className="text-muted-foreground text-lg print:text-black/70">
                    {formatDateRange(t.start_date, t.end_date)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <BrochureLink url={t?.brochure_url ?? null} />
                {t?.chessresults_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={t.chessresults_url} target="_blank" rel="noreferrer">
                      Chess Results
                    </a>
                  </Button>
                )}
                {t?.public_results_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={t.public_results_url} target="_blank" rel="noreferrer">
                      External Results
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-6 py-10">
          <div className="max-w-5xl mx-auto space-y-10">
            {error ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Unable to load tournament details.
                </CardContent>
              </Card>
            ) : !t ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Tournament not found.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border bg-card/80 shadow-lg print:bg-white print:border-black/40">
                <CardHeader className="border-b border-border bg-muted/40 print:bg-white print:border-black/30">
                  <CardTitle className="text-2xl font-bold print:text-black">Tournament Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                        Dates & Venue
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Dates</span>
                          <span className="text-muted-foreground print:text-black/70">{formatDateRange(t.start_date, t.end_date)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Venue</span>
                          <span className="text-muted-foreground print:text-black/70">{t.venue || "—"}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">City</span>
                          <span className="text-muted-foreground print:text-black/70">{t.city || "—"}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Event Code</span>
                          <span className="text-muted-foreground print:text-black/70">{t.event_code || "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                        Format
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Format</span>
                          <span className="text-muted-foreground print:text-black/70">
                            {timeControlCategory !== "UNKNOWN" ? (
                              <Badge variant="secondary" className="text-xs">
                                {timeControlCategory}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Time Control</span>
                          <span className="text-muted-foreground print:text-black/70">{timeControlLabel ?? "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                        Officials
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Chief Arbiter</span>
                          <span className="text-muted-foreground print:text-black/70">{t.chief_arbiter || "—"}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Tournament Director</span>
                          <span className="text-muted-foreground print:text-black/70">{t.tournament_director || "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                        Fees & Prizes
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Entry Fee</span>
                          <span className="text-muted-foreground print:text-black/70">
                            {t.entry_fee_amount != null ? formatCurrencyINR(t.entry_fee_amount) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="font-medium text-foreground print:text-black">Total Cash Prize</span>
                          <span className="text-muted-foreground print:text-black/70">
                            {t.cash_prize_total != null ? formatCurrencyINR(t.cash_prize_total) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                      Links
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {t.brochure_url ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={t.brochure_url} target="_blank" rel="noreferrer">
                            Brochure
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">No brochure link</span>
                      )}
                      {t.chessresults_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={t.chessresults_url} target="_blank" rel="noreferrer">
                            Chess Results
                          </a>
                        </Button>
                      )}
                      {t.public_results_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={t.public_results_url} target="_blank" rel="noreferrer">
                            External Final Results
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black/70">
                      Notes
                    </div>
                    <div className="rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground whitespace-pre-wrap print:bg-white print:border-black/30 print:text-black/70">
                      {t.notes || "No additional notes provided."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border bg-card/80 shadow-sm print:bg-white print:border-black/40">
              <CardHeader className="border-b border-border print:border-black/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-2xl font-bold print:text-black">Final Ranks</CardTitle>
                  {typeof version === "number" && (
                    <Badge variant="outline" className="text-xs print:border-black/40 print:text-black">
                      Allocations v{version}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {!grouped?.groups?.length ? (
                  <div className="text-center text-muted-foreground">
                    No published results yet.
                  </div>
                ) : (
                  <CategoryCardsView groups={grouped.groups} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
