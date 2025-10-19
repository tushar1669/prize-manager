import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RuleChip } from "@/components/ui/rule-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Upload, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";

export default function TournamentSetup() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "details";

  const [prizes, setPrizes] = useState([
    { rank: 1, cash: 5000, trophy: true, medal: false },
    { rank: 2, cash: 3000, trophy: false, medal: true },
    { rank: 3, cash: 2000, trophy: false, medal: true },
  ]);

  const [categories, setCategories] = useState([
    { id: "1", name: "Under 13", criteria: "Age ≤ 13" },
    { id: "2", name: "Female", criteria: "Gender = Female" },
  ]);

  const handleAddPrize = () => {
    setPrizes([...prizes, { rank: prizes.length + 1, cash: 0, trophy: false, medal: false }]);
  };

  const handleRemovePrize = (index: number) => {
    setPrizes(prizes.filter((_, i) => i !== index));
  };

  const handleSaveAndContinue = () => {
    toast.success("Tournament details saved");
    navigate(`/t/${id}/setup?tab=prizes`);
  };

  const handleNext = () => {
    toast.success("Prize structure saved");
    navigate(`/t/${id}/import`);
  };

  const handleCancel = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Setup</h1>
          <p className="text-muted-foreground">Configure your tournament details and prize structure</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => navigate(`/t/${id}/setup?tab=${v}`)}>
          <TabsList className="mb-6">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="prizes">Prize Structure</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tournament Information</CardTitle>
                <CardDescription>Basic details about your tournament</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Tournament Title <span className="text-destructive">*</span>
                  </Label>
                  <Input id="title" placeholder="e.g., National Chess Championship 2024" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">
                      Start Date <span className="text-destructive">*</span>
                    </Label>
                    <Input id="startDate" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">
                      End Date <span className="text-destructive">*</span>
                    </Label>
                    <Input id="endDate" type="date" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="venue">Venue</Label>
                    <Input id="venue" placeholder="Tournament venue" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" placeholder="City name" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eventCode">Event Code</Label>
                  <Input id="eventCode" placeholder="Optional event identifier" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" placeholder="Additional information..." rows={4} />
                </div>

                <div className="space-y-2">
                  <Label>Tournament Brochure</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleSaveAndContinue} className="gap-2">
                Save & Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="prizes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Main Prizes (Open)</CardTitle>
                <CardDescription>Define prizes for top finishers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="w-20">Rank</TableHead>
                      <TableHead>Cash Amount</TableHead>
                      <TableHead className="w-24">Trophy</TableHead>
                      <TableHead className="w-24">Medal</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prizes.map((prize, index) => (
                      <TableRow key={index} className="border-border">
                        <TableCell className="font-medium">{prize.rank}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={prize.cash}
                            onChange={(e) => {
                              const newPrizes = [...prizes];
                              newPrizes[index].cash = parseInt(e.target.value) || 0;
                              setPrizes(newPrizes);
                            }}
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={prize.trophy}
                            onCheckedChange={(checked) => {
                              const newPrizes = [...prizes];
                              newPrizes[index].trophy = checked as boolean;
                              setPrizes(newPrizes);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={prize.medal}
                            onCheckedChange={(checked) => {
                              const newPrizes = [...prizes];
                              newPrizes[index].medal = checked as boolean;
                              setPrizes(newPrizes);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {prizes.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePrize(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button variant="outline" size="sm" onClick={handleAddPrize} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Add Prize Row
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Category Prizes</CardTitle>
                    <CardDescription>Age, rating, and special categories</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Category
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {categories.length > 0 ? (
                  <div className="space-y-3">
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium text-foreground">{cat.name}</h4>
                          <p className="text-sm text-muted-foreground">{cat.criteria}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">Edit</Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No categories added yet
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Allocation Rules</CardTitle>
                <CardDescription>Default rules for prize allocation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <RuleChip icon="lock" locked>One-Prize Rule</RuleChip>
                  <RuleChip icon="trend">Main Priority</RuleChip>
                  <RuleChip icon="alert">Strict Age: ON</RuleChip>
                  <RuleChip>Unrated in Rating: OFF</RuleChip>
                  <RuleChip>Tie Rule: Prefer Main</RuleChip>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleNext} className="gap-2">
                Next: Import Players
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
