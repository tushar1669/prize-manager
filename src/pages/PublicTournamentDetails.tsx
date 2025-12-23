import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ErrorPanel from "@/components/ui/ErrorPanel";
import { useErrorPanel } from "@/hooks/useErrorPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TournamentDetails = {
  title: string;
  start_date: string;
  end_date: string;
  venue?: string | null;
  city?: string | null;
  event_code?: string | null;
  notes?: string | null;
  brochure_url?: string | null;
  chessresults_url?: string | null;
  public_results_url?: string | null;
  public_slug?: string | null;
};

export default function PublicTournamentDetails() {
  const { slug } = useParams();
  const { error, showError, clearError } = useErrorPanel();
  const [t, setT] = useState<TournamentDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        console.log('[publish] fetching details for slug', slug);
        const { data, error } = await supabase
          .from("tournaments")
          .select("title, start_date, end_date, venue, city, event_code, notes, brochure_url, chessresults_url, public_results_url, public_slug")
          .eq("public_slug", slug)
          .maybeSingle();
        
        if (error) throw error;
        console.log('[publish] tournament details loaded', data);
        setT(data as TournamentDetails | null);
      } catch (e: unknown) {
        console.error("[publish] details error", e);
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        showError({ 
          title: "Failed to load tournament", 
          message: errMsg,
          hint: "Please check your connection and try again."
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, showError]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-6">
          <div className="animate-pulse">Loading tournament details…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <ErrorPanel error={error} onDismiss={clearError} />
        
        {!t ? (
          <div className="text-center py-12 opacity-60">
            Tournament not found
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl">{t.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex gap-2">
                    <span className="font-semibold min-w-32">Dates:</span>
                    <span>{t.start_date} – {t.end_date}</span>
                  </div>
                  
                  {t.venue && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">Venue:</span>
                      <span>{t.venue}</span>
                    </div>
                  )}
                  
                  {t.city && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">City:</span>
                      <span>{t.city}</span>
                    </div>
                  )}
                  
                  {t.event_code && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">Event Code:</span>
                      <span>{t.event_code}</span>
                    </div>
                  )}
                  
                  {t.brochure_url && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">Brochure:</span>
                      <a 
                        className="text-primary underline hover:no-underline" 
                        href={t.brochure_url} 
                        target="_blank" 
                        rel="noreferrer"
                      >
                        View PDF
                      </a>
                    </div>
                  )}
                  
                  {t.chessresults_url && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">Chess Results:</span>
                      <a 
                        className="text-primary underline hover:no-underline" 
                        href={t.chessresults_url} 
                        target="_blank" 
                        rel="noreferrer"
                      >
                        View
                      </a>
                    </div>
                  )}
                  
                  {t.public_results_url && (
                    <div className="flex gap-2">
                      <span className="font-semibold min-w-32">Results:</span>
                      <a 
                        className="text-primary underline hover:no-underline" 
                        href={t.public_results_url} 
                        target="_blank" 
                        rel="noreferrer"
                      >
                        View Results
                      </a>
                    </div>
                  )}
                </div>
                
                {t.notes && (
                  <div className="pt-4 border-t">
                    <div className="font-semibold mb-2">Notes:</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{t.notes}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
