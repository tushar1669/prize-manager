import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RuleChip } from "@/components/ui/rule-chip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Conflict {
  id: string;
  player: string;
  prizes: string[];
  suggested: string;
  reasons: string[];
  type: "multi-eligibility" | "equal-value" | "rule-exclusion";
}

export default function ConflictReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conflicts, setConflicts] = useState<Conflict[]>([
    {
      id: "1",
      player: "Alice Kumar",
      prizes: ["1st Place (Main)", "1st Place (U13)", "1st Place (Female)"],
      suggested: "1st Place (Main)",
      reasons: ["One-Prize Rule", "Main Priority", "Higher Cash Value"],
      type: "multi-eligibility",
    },
    {
      id: "2",
      player: "Eve Patel",
      prizes: ["5th Place (Main)", "2nd Place (Female)"],
      suggested: "5th Place (Main)",
      reasons: ["Equal Cash Value", "Prefer Main (Tie Rule)"],
      type: "equal-value",
    },
  ]);

  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(conflicts[0]);
  const [strictAge, setStrictAge] = useState(true);
  const [allowUnrated, setAllowUnrated] = useState(false);

  const handleAccept = (conflictId: string) => {
    setConflicts(conflicts.filter((c) => c.id !== conflictId));
    if (selectedConflict?.id === conflictId) {
      setSelectedConflict(conflicts[0] || null);
    }
    toast.success("Conflict resolved");
  };

  const handleAcceptAll = () => {
    setConflicts([]);
    setSelectedConflict(null);
    toast.success("All conflicts resolved");
  };

  const handleRecompute = () => {
    toast.info("Recomputing allocations...");
  };

  const handleFinalize = () => {
    if (conflicts.length === 0) {
      toast.success("Moving to finalization");
      navigate(`/t/${id}/finalize`);
    } else {
      toast.error("Please resolve all conflicts before finalizing");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Conflict Review & Rule Audit</h1>
          <p className="text-muted-foreground">
            Resolve all conflicts before finalizing allocations
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Conflicts List */}
          <div className="col-span-5">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-warning" />
                    Conflicts ({conflicts.length})
                  </CardTitle>
                  {conflicts.length > 0 && (
                    <Button size="sm" variant="outline" onClick={handleAcceptAll}>
                      Accept All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {conflicts.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-success" />
                    <p className="text-foreground font-medium mb-1">All Clear!</p>
                    <p className="text-sm text-muted-foreground">
                      No conflicts found. Ready to finalize.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {conflicts.map((conflict) => (
                        <div
                          key={conflict.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                            selectedConflict?.id === conflict.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                          onClick={() => setSelectedConflict(conflict)}
                        >
                          <h4 className="font-medium text-foreground mb-2">{conflict.player}</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Eligible for {conflict.prizes.length} prizes
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {conflict.reasons.map((reason, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-xs bg-warning/10 text-warning border-warning/30"
                              >
                                {reason}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detail Panel */}
          <div className="col-span-7 space-y-6">
            {selectedConflict ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedConflict.player}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-3 block">
                        Eligible Prizes
                      </Label>
                      <div className="space-y-2">
                        {selectedConflict.prizes.map((prize, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border ${
                              prize === selectedConflict.suggested
                                ? "border-primary bg-primary/5"
                                : "border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-foreground">{prize}</span>
                              {prize === selectedConflict.suggested && (
                                <Badge className="bg-primary text-primary-foreground">
                                  Suggested
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-muted-foreground mb-3 block">
                        Resolution Reasons
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedConflict.reasons.map((reason, idx) => (
                          <RuleChip key={idx}>{reason}</RuleChip>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        onClick={() => handleAccept(selectedConflict.id)}
                        className="flex-1"
                      >
                        Accept Suggestion
                      </Button>
                      <Button variant="outline" className="flex-1">
                        Override
                      </Button>
                      <Button variant="outline">
                        Adjust Rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Global Rule Toggles</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="strict-age" className="text-foreground">Strict Age</Label>
                        <p className="text-sm text-muted-foreground">
                          Players only eligible for their age group
                        </p>
                      </div>
                      <Switch
                        id="strict-age"
                        checked={strictAge}
                        onCheckedChange={setStrictAge}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="allow-unrated" className="text-foreground">
                          Allow Unrated in Rating Categories
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Include unrated players in rating brackets
                        </p>
                      </div>
                      <Switch
                        id="allow-unrated"
                        checked={allowUnrated}
                        onCheckedChange={setAllowUnrated}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleRecompute}
                      className="w-full gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Recompute Allocations
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="h-full flex items-center justify-center min-h-[500px]">
                <CardContent className="text-center">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-success" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Ready to Finalize
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    All conflicts have been resolved. You can now proceed to finalization.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => navigate(`/t/${id}/import`)}>
            Back to Import
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={conflicts.length > 0}
            className="gap-2"
          >
            {conflicts.length > 0 ? (
              <>
                <AlertCircle className="h-4 w-4" />
                Resolve All Conflicts First
              </>
            ) : (
              <>
                Finalize Allocations
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
