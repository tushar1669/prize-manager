import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { DuplicateGroupSection } from './DuplicateGroupSection';
import { MergePolicyAdvancedPanel } from './MergePolicyAdvancedPanel';
import { groupByConfidence, getProgressCounts, getActionCounts } from '@/utils/dedupHelpers';
import type { DedupCandidate, DedupDecision, DedupSummary, DedupAction, MergePolicy } from '@/utils/dedup';

interface DeduplicationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: DedupCandidate[];
  decisions: DedupDecision[];
  summary: DedupSummary;
  mergePolicy: MergePolicy;
  onMergePolicyChange: (policy: MergePolicy) => void;
  onDecisionsChange: (decisions: DedupDecision[]) => void;
  onConfirm: () => void;
}

export function DeduplicationWizard({
  open,
  onOpenChange,
  candidates,
  decisions,
  summary,
  mergePolicy,
  onMergePolicyChange,
  onDecisionsChange,
  onConfirm,
}: DeduplicationWizardProps) {
  // Convert decisions array to map for easier lookup
  const decisionsMap = useMemo(() => {
    const map: Record<number, DedupAction> = {};
    decisions.forEach(d => {
      map[d.row] = d.action;
    });
    return map;
  }, [decisions]);

  const [localDecisions, setLocalDecisions] = useState<Record<number, DedupAction>>(decisionsMap);

  // Group candidates by confidence
  const grouped = useMemo(() => groupByConfidence(candidates), [candidates]);

  // Filter to only show candidates with matches
  const candidatesWithMatches = useMemo(
    () => candidates.filter(c => c.bestMatch),
    [candidates]
  );

  // Calculate progress
  const progress = useMemo(
    () => getProgressCounts(candidates, localDecisions),
    [candidates, localDecisions]
  );

  // Calculate action counts for summary
  const actionCounts = useMemo(() => {
    // Build full decisions including defaults
    const fullDecisions: Record<number, DedupAction> = {};
    candidates.forEach(c => {
      fullDecisions[c.row] = localDecisions[c.row] ?? c.defaultAction;
    });
    return getActionCounts(fullDecisions);
  }, [candidates, localDecisions]);

  const handleActionChange = (row: number, action: DedupAction) => {
    setLocalDecisions(prev => ({
      ...prev,
      [row]: action,
    }));
  };

  const handleConfirm = () => {
    // Convert local decisions back to array format
    const updatedDecisions: DedupDecision[] = candidates.map(candidate => {
      const action = localDecisions[candidate.row] ?? candidate.defaultAction;
      const decision: DedupDecision = {
        row: candidate.row,
        action,
      };

      if (action === 'update' && candidate.bestMatch) {
        decision.existingId = candidate.bestMatch.existing.id;
        decision.payload = candidate.bestMatch.merge.changes;
      } else if (action === 'skip' && candidate.bestMatch) {
        decision.existingId = candidate.bestMatch.existing.id;
      }

      return decision;
    });

    onDecisionsChange(updatedDecisions);
    onConfirm();
  };

  const progressPercent = progress.total > 0 ? (progress.resolved / progress.total) * 100 : 100;

  // No duplicates case
  if (candidatesWithMatches.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              No Duplicates Detected
            </DialogTitle>
            <DialogDescription>
              All {candidates.length} player{candidates.length !== 1 ? 's' : ''} will be imported as new records. 
              No existing matches were found.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Review Duplicate Players</DialogTitle>
          <DialogDescription>
            We found {candidatesWithMatches.length} potential duplicate{candidatesWithMatches.length !== 1 ? 's' : ''}. 
            Please review each match and choose an action.
          </DialogDescription>
          
          {/* Progress indicator */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Progress: {progress.resolved} of {progress.total} reviewed
              </span>
              <span className="font-medium">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Summary badges */}
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300">
              {actionCounts.create} Create
            </Badge>
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300">
              {actionCounts.update} Update
            </Badge>
            <Badge variant="outline" className="bg-gray-50 dark:bg-gray-950/20 text-gray-700 dark:text-gray-300">
              {actionCounts.skip} Skip
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="space-y-4 py-4">
            {/* High confidence matches */}
            <DuplicateGroupSection
              title="High Confidence Matches"
              confidence="high"
              candidates={grouped.high}
              decisions={localDecisions}
              onActionChange={handleActionChange}
              mergePolicy={mergePolicy}
              defaultOpen={true}
            />

            {/* Medium confidence matches */}
            <DuplicateGroupSection
              title="Medium Confidence Matches"
              confidence="medium"
              candidates={grouped.medium}
              decisions={localDecisions}
              onActionChange={handleActionChange}
              mergePolicy={mergePolicy}
              defaultOpen={grouped.high.length === 0}
            />

            {/* Low confidence matches */}
            <DuplicateGroupSection
              title="Low Confidence Matches"
              confidence="low"
              candidates={grouped.low}
              decisions={localDecisions}
              onActionChange={handleActionChange}
              mergePolicy={mergePolicy}
              defaultOpen={grouped.high.length === 0 && grouped.medium.length === 0}
            />

            {/* Advanced merge policy options */}
            <div className="pt-2">
              <MergePolicyAdvancedPanel
                mergePolicy={mergePolicy}
                onMergePolicyChange={onMergePolicyChange}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {actionCounts.create} new · {actionCounts.update} updated · {actionCounts.skip} skipped
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>
                Apply Decisions
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
