import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info } from "lucide-react";

interface GenderDetectionChipProps {
  columnName: string;
  sampleValue?: string;
  source: 'fs_column' | 'headerless_after_name';
}

export function GenderDetectionChip({ columnName, sampleValue, source }: GenderDetectionChipProps) {
  const sourceLabel = source === 'fs_column' ? 'F/S column' : 'headerless column';

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant="secondary" className="gap-1 cursor-help">
          <Info className="h-3 w-3" />
          Gender: {sourceLabel} → <span className="font-semibold">{columnName}</span>
          {sampleValue && <span className="ml-1 text-muted-foreground">• e.g. "{sampleValue}"</span>}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Auto-detected gender column</h4>
          {source === 'fs_column' ? (
            <p className="text-sm text-muted-foreground">
              Column <strong>{columnName}</strong> was detected as the gender column based on the Swiss-Manager
              "F/S" field (female/senior). If incorrect, you can manually remap it below.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Column <strong>{columnName}</strong> was detected as the gender column based on Swiss-Manager format
                (typically the column after the second "Name" or before "Rtg").
              </p>
              <p className="text-sm text-muted-foreground">
                If incorrect, you can manually remap it below.
              </p>
            </>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
