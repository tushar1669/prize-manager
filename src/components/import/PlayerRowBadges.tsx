import { Badge } from "@/components/ui/badge";

interface PlayerRowBadgesProps {
  stateAutoExtracted?: boolean;
  extractedState?: string;
  rankAutofilled?: boolean;
}

export function PlayerRowBadges({ 
  stateAutoExtracted, 
  extractedState,
  rankAutofilled 
}: PlayerRowBadgesProps) {
  if (!stateAutoExtracted && !rankAutofilled) {
    return null;
  }

  return (
    <div className="flex gap-1.5 mt-1 flex-wrap">
      {stateAutoExtracted && extractedState && (
        <Badge 
          variant="outline" 
          className="text-[10px] px-1 py-0 h-4 font-mono border-primary/30 bg-primary/5 text-primary"
        >
          state: {extractedState} (from Ident)
        </Badge>
      )}
      {rankAutofilled && (
        <Badge 
          variant="outline" 
          className="text-[10px] px-1 py-0 h-4 font-mono border-muted-foreground/30 bg-muted text-muted-foreground"
        >
          rank autofilled
        </Badge>
      )}
    </div>
  );
}
