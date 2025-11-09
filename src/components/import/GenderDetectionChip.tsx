import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info } from "lucide-react";

interface GenderDetectionChipProps {
  columnName: string;
  sampleValue?: string;
}

export function GenderDetectionChip({ columnName, sampleValue }: GenderDetectionChipProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant="secondary" className="gap-1 cursor-help">
          <Info className="h-3 w-3" />
          Gender: detected (headerless)
          {sampleValue && <span className="ml-1">• e.g. "{sampleValue}"</span>}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Auto-detected from headerless column</h4>
          <p className="text-sm text-muted-foreground">
            Column <strong>{columnName}</strong> was detected as the gender column based on Swiss-Manager format 
            (typically the column after 2nd "Name" or before "Rtg").
          </p>
          <p className="text-sm text-muted-foreground">
            If incorrect, you can manually remap it below.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
