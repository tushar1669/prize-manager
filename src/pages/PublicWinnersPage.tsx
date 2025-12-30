import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useFinalPrizeData } from "@/hooks/useFinalPrizeData";
import { CategoryCardsView } from "@/components/final-prize/CategoryCardsView";
import { PosterGridView } from "@/components/final-prize/PosterGridView";
import { ArbiterSheetView } from "@/components/final-prize/ArbiterSheetView";
import { formatCurrencyINR } from "@/utils/currency";
import { BrochureLink } from "@/components/public/BrochureLink";
import { PublicBackButton } from "@/components/public/PublicBackButton";

export default function PublicWinnersPage() {
  const { id } = useParams();
  const [activeView, setActiveView] = useState<string>("v1");

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ['public-tournament-by-id', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, title, start_date, end_date, city, brochure_url')
        .eq('id', id)
        .eq('is_published', true)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        console.log(`[public-winners] Loaded tournament id=${id}`);
      }
      return data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  const { data: prizeData, isLoading: prizeLoading, grouped } = useFinalPrizeData(tournament?.id);

  const isLoading = tournamentLoading || prizeLoading;

  if (isLoading) {
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

  const totalPrizes = prizeData?.winners?.length || 0;
  const totalCash = prizeData?.totals?.totalCash || 0;
  const categories = grouped?.groups || [];

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      <div className="container mx-auto px-4 py-8 pm-print-page print:px-4 print:py-3">
        <div className="mb-4 flex justify-center print:hidden">
          <Link to="/" aria-label="Prize-Manager home">
            <img
              src="/brand/prize-manager-logo.png"
              alt="Prize-Manager"
              className="h-10 w-auto max-w-[220px] object-contain"
            />
          </Link>
        </div>
        <div className="mb-4 print:hidden">
          <PublicBackButton />
        </div>
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
            <div className="mb-4 print:hidden">
              <BrochureLink url={tournament.brochure_url} />
            </div>
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
          </CardContent>
        </Card>

        <Card className="bg-card border-border print:border-black print:bg-white">
          <CardHeader className="print:pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-2xl font-bold text-foreground print:text-lg print:text-black">Winners</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="print:px-2">
            {!prizeData?.winners || prizeData.winners.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 print:text-black/70">
                No winners allocated yet
              </div>
            ) : (
              <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-6 print:hidden">
                  <TabsTrigger value="v1">Category Cards</TabsTrigger>
                  <TabsTrigger value="table">Table View</TabsTrigger>
                  <TabsTrigger value="poster">Poster Grid</TabsTrigger>
                  <TabsTrigger value="arbiter">Arbiter Sheet</TabsTrigger>
                </TabsList>

                <TabsContent value="v1" className={activeView !== 'v1' ? 'print:hidden' : ''}>
                  <CategoryCardsView groups={categories} />
                </TabsContent>

                <TabsContent value="table" className={activeView !== 'table' ? 'print:hidden' : ''}>
                  <Table className="print:text-[11px]">
                    <TableHeader className="print:bg-black/5">
                      <TableRow className="border-border print:border-black">
                        <TableHead className="w-16 text-base print:text-black print:text-[11px]">Place</TableHead>
                        <TableHead className="text-base print:text-black print:text-[11px]">Category</TableHead>
                        <TableHead className="text-base print:text-black print:text-[11px]">Player</TableHead>
                        <TableHead className="w-20 text-base print:text-black print:text-[11px]">Rank</TableHead>
                        <TableHead className="text-base print:text-black print:text-[11px]">Club</TableHead>
                        <TableHead className="w-24 text-base print:text-black print:text-[11px]">State</TableHead>
                        <TableHead className="w-32 text-right text-base print:text-black print:text-[11px]">Prize</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prizeData.winners.map((winner, idx) => (
                        <TableRow key={idx} className="border-border print:border-black/20">
                          <TableCell className="font-bold text-base text-foreground print:text-[11px] print:text-black">{winner.place}</TableCell>
                          <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{winner.categoryName}</TableCell>
                          <TableCell className="font-semibold text-base text-foreground print:text-[11px] print:text-black">{winner.playerName}</TableCell>
                          <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{winner.rank || '—'}</TableCell>
                          <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{winner.club || '—'}</TableCell>
                          <TableCell className="text-base text-muted-foreground print:text-[11px] print:text-black/70">{winner.state || '—'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2 print:gap-1">
                              {winner.hasTrophy && <Trophy className="h-5 w-5 text-accent print:h-3 print:w-3 print:text-black" />}
                              {winner.hasMedal && <Medal className="h-5 w-5 text-success print:h-3 print:w-3 print:text-black" />}
                              {winner.amount > 0 && (
                                <span className="font-bold text-base text-success print:text-[11px] print:text-black">
                                  {formatCurrencyINR(winner.amount)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="poster" className={activeView !== 'poster' ? 'print:hidden' : ''}>
                  {tournament?.id && <PosterGridView winners={prizeData.winners} tournamentId={tournament.id} />}
                </TabsContent>

                <TabsContent value="arbiter" className={activeView !== 'arbiter' ? 'print:hidden' : ''}>
                  <ArbiterSheetView winners={prizeData.winners} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-muted-foreground print:hidden">
          <Link to="/" className="hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
