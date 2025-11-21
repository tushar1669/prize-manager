import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { DuplicateSetCard } from './DuplicateSetCard';
import type { DedupCandidate, DedupAction, MergePolicy } from '@/utils/dedup';
import type { ConfidenceLevel } from '@/utils/dedupHelpers';

interface DuplicateGroupSectionProps {
  title: string;
  confidence: ConfidenceLevel;
  candidates: DedupCandidate[];
  decisions: Record<number, DedupAction>;
  onActionChange: (row: number, action: DedupAction) => void;
  mergePolicy: MergePolicy;
  defaultOpen?: boolean;
}

const confidenceColors: Record<ConfidenceLevel, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  low: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
};

export function DuplicateGroupSection({
  title,
  confidence,
  candidates,
  decisions,
  onActionChange,
  mergePolicy,
  defaultOpen = true,
}: DuplicateGroupSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (candidates.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className={confidenceColors[confidence]}>
            {candidates.length} match{candidates.length !== 1 ? 'es' : ''}
          </Badge>
        </div>
        <ChevronDown 
          className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-4">
        {candidates.map(candidate => (
          <DuplicateSetCard
            key={candidate.row}
            candidate={candidate}
            decision={decisions[candidate.row] ?? null}
            onActionChange={(action) => onActionChange(candidate.row, action)}
            mergePolicy={mergePolicy}
            confidence={confidence}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
