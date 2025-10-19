import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, ArrowRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Player {
  rank: number;
  name: string;
  rating: number;
  dob: string;
  gender: string;
  club: string;
  tags: string[];
}

export default function PlayerImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hasData, setHasData] = useState(true);

  const mockPlayers: Player[] = [
    { rank: 1, name: "Alice Kumar", rating: 2145, dob: "2010-05-12", gender: "F", club: "Chennai Chess Club", tags: ["U13", "F"] },
    { rank: 2, name: "Bob Smith", rating: 2089, dob: "2008-08-22", gender: "M", club: "Mumbai Chess Academy", tags: ["U13"] },
    { rank: 3, name: "Carol Lee", rating: 1956, dob: "2011-02-15", gender: "F", club: "Delhi Knights", tags: ["U13", "F"] },
    { rank: 4, name: "David Chen", rating: 1823, dob: "2012-11-03", gender: "M", club: "Bangalore Masters", tags: ["U13"] },
    { rank: 5, name: "Eve Patel", rating: 0, dob: "2013-07-19", gender: "F", club: "Local Club", tags: ["U13", "F", "Unrated"] },
  ];

  const handleContinue = () => {
    toast.success("Players imported successfully");
    navigate(`/t/${id}/review`);
  };

  const handleBack = () => {
    navigate(`/t/${id}/setup?tab=prizes`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Player Import</h1>
          <p className="text-muted-foreground">Upload final standings from your tournament</p>
        </div>

        {!hasData ? (
          <div className="grid grid-cols-2 gap-6">
            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Upload CSV/Excel</CardTitle>
                    <CardDescription>Import from file</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground">Click or drag file here</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-primary transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-secondary/10">
                    <FileSpreadsheet className="h-6 w-6 text-secondary" />
                  </div>
                  <div>
                    <CardTitle>Paste from Chess-Results</CardTitle>
                    <CardDescription>Quick paste option</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">Open Paste Dialog</Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Imported Players</CardTitle>
                    <CardDescription>{mockPlayers.length} players imported</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Import Different File
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border">
                        <TableHead className="w-16">Rank</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-24">Rating</TableHead>
                        <TableHead className="w-32">DOB</TableHead>
                        <TableHead className="w-24">Gender</TableHead>
                        <TableHead>Club</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mockPlayers.map((player) => (
                        <TableRow key={player.rank} className="border-border">
                          <TableCell className="font-medium">{player.rank}</TableCell>
                          <TableCell className="font-medium text-foreground">{player.name}</TableCell>
                          <TableCell>
                            {player.rating === 0 ? (
                              <span className="text-muted-foreground italic">Unrated</span>
                            ) : (
                              player.rating
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{player.dob}</TableCell>
                          <TableCell>{player.gender}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{player.club}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {player.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs bg-primary/10 text-primary border-primary/30"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-warning/50 bg-warning/5">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <CardTitle className="text-base">Data Completeness</CardTitle>
                    <CardDescription className="mt-1">
                      All players have complete data for age and gender eligibility checks.
                      Players with missing DOB or gender will be flagged in conflict review.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleBack}>
                Back to Prize Structure
              </Button>
              <Button onClick={handleContinue} className="gap-2">
                Continue to Conflict Review
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
