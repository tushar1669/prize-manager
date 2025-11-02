import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type {
  DedupAction,
  DedupCandidate,
  DedupDecision,
  DedupSummary,
  MergePolicy,
} from "@/utils/dedup";

interface DuplicateReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: DedupCandidate[];
  decisions: DedupDecision[];
  summary: DedupSummary;
  mergePolicy: MergePolicy;
  onMergePolicyChange: (policy: MergePolicy) => void;
  onActionChange: (candidate: DedupCandidate, action: DedupAction) => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

const fieldLabels: Record<string, string> = {
  name: "Name",
  fide_id: "FIDE ID",
  dob: "DOB",
  rating: "Rating",
  gender: "Gender",
  state: "State",
  city: "City",
  club: "Club",
  federation: "Federation",
  disability: "Disability",
  special_notes: "Notes",
};

const displayFields = [
  "name",
  "fide_id",
  "dob",
  "rating",
  "gender",
  "state",
  "city",
  "club",
  "federation",
  "disability",
  "special_notes",
];

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return String(value);
  return String(value);
}

export function DuplicateReviewDialog({
  open,
  onOpenChange,
  candidates,
  decisions,
  summary,
  mergePolicy,
  onMergePolicyChange,
  onActionChange,
  onConfirm,
  isSubmitting = false,
}: DuplicateReviewDialogProps) {
  const decisionMap = useMemo(() => {
    return new Map(decisions.map(decision => [decision.row, decision]));
  }, [decisions]);

  const candidatesWithMatches = useMemo(
    () => candidates.filter(candidate => candidate.matches.length > 0),
    [candidates],
  );

  const counts = useMemo(() => {
    return decisions.reduce(
      (acc, decision) => {
        acc[decision.action as "create" | "update" | "skip"] += 1;
        return acc;
      },
      { create: 0, update: 0, skip: 0 },
    );
  }, [decisions]);

  const handlePolicyToggle = (key: keyof MergePolicy, value: boolean) => {
    onMergePolicyChange({ ...mergePolicy, [key]: value });
  };

  const autoCreateCount = counts.create;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Review Potential Duplicates</DialogTitle>
          <DialogDescription>
            We detected existing players that closely match your incoming data. Choose how to handle each match before
            finalizing the import.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4 pr-2">
          {candidatesWithMatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/10 p-6 text-sm text-muted-foreground text-center">
              No duplicate candidates detected. All {autoCreateCount} players will be created as new records.
            </div>
          ) : (
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              {candidatesWithMatches.map(candidate => {
                const best = candidate.bestMatch;
                const decision = decisionMap.get(candidate.row) ?? { row: candidate.row, action: candidate.defaultAction };
                const selectedAction = decision.action;
                const changedFields = best?.merge.changedFields ?? [];
                const disableUpdate = !best || changedFields.length === 0;

                return (
                  <div key={candidate.row} className="rounded-lg border border-border/60 bg-background p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold">Row {candidate.row}: {candidate.incoming.name}</div>
                        {best && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {best.reason}. Score {(best.score * 100).toFixed(0)}%.{' '}
                            {changedFields.length > 0
                              ? `Fields to update: ${changedFields.join(', ')}`
                              : 'No field changes detected (will skip by default).'}
                          </div>
                        )}
                      </div>

                      <RadioGroup
                        className="flex gap-3"
                        value={selectedAction}
                        onValueChange={value => onActionChange(candidate, value as DedupAction)}
                      >
                        <div className="flex items-center gap-2 text-xs md:text-sm">
                          <RadioGroupItem
                            value="update"
                            id={`update-${candidate.row}`}
                            disabled={disableUpdate}
                          />
                          <Label htmlFor={`update-${candidate.row}`} className="font-normal">
                            Update existing
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 text-xs md:text-sm">
                          <RadioGroupItem
                            value="create"
                            id={`create-${candidate.row}`}
                          />
                          <Label htmlFor={`create-${candidate.row}`} className="font-normal">
                            Create new
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 text-xs md:text-sm">
                          <RadioGroupItem
                            value="skip"
                            id={`skip-${candidate.row}`}
                            disabled={!best}
                          />
                          <Label htmlFor={`skip-${candidate.row}`} className="font-normal">
                            Skip import
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border bg-muted/40 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Incoming player
                          <Badge variant="outline">New</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          {displayFields.map(field => {
                            const value = candidate.incoming[field];
                            return (
                              <div key={field} className="flex justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">{fieldLabels[field]}</span>
                                <span className="text-xs text-right">{formatValue(value)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/40 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Existing record
                          {best ? (
                            <Badge variant="secondary">Match</Badge>
                          ) : (
                            <Badge variant="outline">N/A</Badge>
                          )}
                        </div>
                        {best ? (
                          <div className="space-y-1 text-sm">
                            {displayFields.map(field => {
                              const value = best.existing[field as keyof typeof best.existing];
                              const isChanged = changedFields.includes(field);
                              return (
                                <div key={field} className="flex justify-between gap-2">
                                  <span className="text-xs font-medium text-muted-foreground">{fieldLabels[field]}</span>
                                  <span className={`text-xs text-right ${isChanged ? 'font-semibold text-emerald-600' : ''}`}>
                                    {formatValue(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No existing record was matched.</p>
                        )}
                      </div>
                    </div>

                    {selectedAction === "update" && disableUpdate && (
                      <div className="mt-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                        The merge policy does not update any fields for this match. Switch to “Create new” or adjust the policy
                        below.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-md border bg-muted/20 p-4 text-sm">
            <div className="font-medium">Summary</div>
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
              <div>
                <span className="font-semibold">Creates:</span> {counts.create}
              </div>
              <div>
                <span className="font-semibold">Updates:</span> {counts.update}
              </div>
              <div>
                <span className="font-semibold">Skips:</span> {counts.skip}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Score threshold {Math.round(summary.scoreThreshold * 100)}%. Matched {summary.matchedCandidates} of {summary.totalCandidates} players.
            </div>
          </div>

          <div className="rounded-md border bg-background p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merge policy overrides</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="fill-blanks" className="text-xs font-medium">Fill blank fields</Label>
                <Switch
                  id="fill-blanks"
                  checked={mergePolicy.fillBlanks}
                  onCheckedChange={value => handlePolicyToggle("fillBlanks", value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="prefer-rating" className="text-xs font-medium">Prefer higher rating</Label>
                <Switch
                  id="prefer-rating"
                  checked={mergePolicy.preferNewerRating}
                  onCheckedChange={value => handlePolicyToggle("preferNewerRating", value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="never-dob" className="text-xs font-medium">Never overwrite DOB</Label>
                <Switch
                  id="never-dob"
                  checked={mergePolicy.neverOverwriteDob}
                  onCheckedChange={value => handlePolicyToggle("neverOverwriteDob", value)}
                />
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-muted-foreground">
              Decisions will be applied in a single transaction. You can adjust actions above or change the merge policy before
              confirming.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={isSubmitting}>
                {isSubmitting ? "Applying…" : "Apply actions"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
