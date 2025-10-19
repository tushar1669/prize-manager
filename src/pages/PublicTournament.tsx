import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileDown, Trophy, Calendar, MapPin, Info } from "lucide-react";
import { toast } from "sonner";

export default function PublicTournament() {
  const handleDownloadPDF = () => {
    toast.success("Downloading PDF...");
  };

  const handleDownloadCSV = () => {
    toast.success("Downloading CSV...");
  };

  const mainPrizes = [
    { rank: 1, player: "Alice Kumar", rating: 2145, prize: "₹5,000 + Trophy" },
    { rank: 2, player: "Bob Smith", rating: 2089, prize: "₹3,000 + Medal" },
    { rank: 3, player: "Carol Lee", rating: 1956, prize: "₹2,000 + Medal" },
  ];

  const categories = [
    {
      name: "Under 13",
      prizes: [
        { place: 1, player: "David Chen", rating: 1823, prize: "₹2,000 + Trophy" },
        { place: 2, player: "Eve Patel", rating: 0, prize: "₹1,500 + Medal", note: "Unrated" },
      ],
    },
    {
      name: "Female",
      prizes: [
        { place: 1, player: "Carol Lee", rating: 1956, prize: "₹2,500 + Trophy" },
        { place: 2, player: "Alice Kumar", rating: 2145, prize: "₹1,800 + Medal" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary/20 via-secondary/10 to-background border-b border-border">
        <div className="container mx-auto px-6 py-16">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 rounded-lg bg-primary/10">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-foreground mb-3">
                  National Chess Championship 2024
                </h1>
                <div className="flex flex-wrap gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>November 1-5, 2024</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>Grand Chess Hall, Mumbai</span>
                  </div>
                </div>
              </div>
              <Badge className="bg-accent text-accent-foreground">v1</Badge>
            </div>

            <Card className="bg-info/10 border-info/30">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-info mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    <strong>One-Prize Rule:</strong> Each player receives only one prize – the highest value
                    prize they are eligible for based on the tournament's allocation rules.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Export Buttons */}
          <div className="flex gap-3">
            <Button onClick={handleDownloadPDF} variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={handleDownloadCSV} variant="outline" className="gap-2">
              <FileDown className="h-4 w-4" />
              Download CSV
            </Button>
          </div>

          {/* Main Prizes */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
                <Trophy className="h-6 w-6 text-primary" />
                Main Prizes (Open)
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border bg-muted/50">
                      <TableHead className="w-20 font-semibold">Rank</TableHead>
                      <TableHead className="font-semibold">Player</TableHead>
                      <TableHead className="w-24 font-semibold">Rating</TableHead>
                      <TableHead className="font-semibold">Prize</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mainPrizes.map((prize) => (
                      <TableRow key={prize.rank} className="border-border">
                        <TableCell className="font-bold text-lg">{prize.rank}</TableCell>
                        <TableCell className="font-medium text-foreground">{prize.player}</TableCell>
                        <TableCell className="text-muted-foreground">{prize.rating}</TableCell>
                        <TableCell className="font-medium text-accent">{prize.prize}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Category Prizes */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-bold text-foreground mb-6">Category Prizes</h2>
              <Accordion type="single" collapsible className="space-y-3">
                {categories.map((category, idx) => (
                  <AccordionItem
                    key={idx}
                    value={`category-${idx}`}
                    className="border border-border rounded-lg px-4 bg-card"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <span className="font-semibold text-foreground">{category.name}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pt-2">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-border">
                              <TableHead className="w-20">Place</TableHead>
                              <TableHead>Player</TableHead>
                              <TableHead className="w-24">Rating</TableHead>
                              <TableHead>Prize</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {category.prizes.map((prize) => (
                              <TableRow key={prize.place} className="border-border">
                                <TableCell className="font-medium">{prize.place}</TableCell>
                                <TableCell className="font-medium text-foreground">
                                  {prize.player}
                                  {prize.note && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      {prize.note}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {prize.rating === 0 ? "N/A" : prize.rating}
                                </TableCell>
                                <TableCell className="font-medium text-accent">
                                  {prize.prize}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pt-8 border-t border-border">
            <p>Version 1 • Published on {new Date().toLocaleDateString()}</p>
            <p className="mt-1">Generated by Prize Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
}
