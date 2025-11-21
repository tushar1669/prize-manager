import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, GitMerge, Users, XCircle } from 'lucide-react';
import type { DedupCandidate, DedupAction, MergePolicy } from '@/utils/dedup';
import type { ConfidenceLevel } from '@/utils/dedupHelpers';

interface DuplicateSetCardProps {
  candidate: DedupCandidate;
  decision: DedupAction | null;
  onActionChange: (action: DedupAction) => void;
  mergePolicy: MergePolicy;
  confidence: ConfidenceLevel;
}

const fieldLabels: Record<string, string> = {
  name: 'Name',
  dob: 'DOB',
  rating: 'Rating',
  fide_id: 'FIDE ID',
  gender: 'Gender',
  state: 'State',
  city: 'City',
  club: 'Club',
  disability: 'Disability',
  federation: 'Federation',
};

const displayFields = ['name', 'dob', 'rating', 'fide_id', 'gender', 'state', 'city'] as const;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toString();
  return String(value);
}

function getConfidenceBadge(confidence: ConfidenceLevel, score: number) {
  const variants = {
    high: 'default' as const,
    medium: 'secondary' as const,
    low: 'outline' as const,
  };
  
  const labels = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  };

  return (
    <Badge variant={variants[confidence]} className="text-xs">
      {labels[confidence]} ({(score * 100).toFixed(0)}%)
    </Badge>
  );
}

export function DuplicateSetCard({
  candidate,
  decision,
  onActionChange,
  mergePolicy,
  confidence,
}: DuplicateSetCardProps) {
  const { incoming, bestMatch } = candidate;
  
  if (!bestMatch) return null;

  const { existing, score, reason, merge } = bestMatch;
  const selectedAction = decision ?? candidate.defaultAction;
  const hasChanges = merge.changedFields.length > 0;

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        {/* Header: Match info */}
        <div className="flex items-center justify-between mb-3 pb-3 border-b">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Row {incoming._originalIndex + 1}
            </Badge>
            {getConfidenceBadge(confidence, score)}
            <span className="text-sm text-muted-foreground">{reason}</span>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Incoming player */}
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              Incoming (New Import)
            </div>
            <div className="space-y-1.5">
              {displayFields.map(field => {
                const value = incoming[field as keyof typeof incoming];
                const isChanged = merge.changedFields.includes(field);
                
                return (
                  <div key={field} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fieldLabels[field]}:</span>
                    <span className={isChanged ? 'font-medium text-green-600' : ''}>
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Existing player */}
          <div>
            <div className="text-sm font-medium mb-2 text-muted-foreground">
              Existing (In Database)
            </div>
            <div className="space-y-1.5">
              {displayFields.map(field => {
                const value = existing[field as keyof typeof existing];
                const isChanged = merge.changedFields.includes(field);
                
                return (
                  <div key={field} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{fieldLabels[field]}:</span>
                    <span className={isChanged ? 'line-through text-muted-foreground' : ''}>
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t">
          <RadioGroup
            value={selectedAction}
            onValueChange={(value) => onActionChange(value as DedupAction)}
          >
            {/* Update / Merge */}
            <div className="flex items-start space-x-2 mb-2">
              <RadioGroupItem value="update" id={`update-${candidate.row}`} />
              <Label 
                htmlFor={`update-${candidate.row}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <GitMerge className="h-4 w-4 text-primary" />
                  <span className="font-medium">Merge as Same Player</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasChanges 
                    ? `Update ${merge.changedFields.length} field${merge.changedFields.length > 1 ? 's' : ''}: ${merge.changedFields.join(', ')}`
                    : 'No changes needed (data already matches)'}
                </div>
              </Label>
            </div>

            {/* Keep both */}
            <div className="flex items-start space-x-2 mb-2">
              <RadioGroupItem value="create" id={`create-${candidate.row}`} />
              <Label 
                htmlFor={`create-${candidate.row}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Keep Both (Different Players)</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Create new player record (they are not the same person)
                </div>
              </Label>
            </div>

            {/* Skip */}
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="skip" id={`skip-${candidate.row}`} />
              <Label 
                htmlFor={`skip-${candidate.row}`}
                className="flex-1 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Skip This Player</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Do not import (existing record is sufficient)
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* Warnings */}
          {selectedAction === 'skip' && (
            <div className="mt-3 flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-amber-900 dark:text-amber-200 text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>This player will NOT be imported. Use this if the existing record is already correct.</span>
            </div>
          )}
          
          {selectedAction === 'update' && !hasChanges && (
            <div className="mt-3 flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded text-blue-900 dark:text-blue-200 text-xs">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>No fields will be updated because the data is already identical.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
