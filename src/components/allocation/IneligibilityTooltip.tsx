import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface IneligibilityTooltipProps {
  reasonCodes: string[];
}

const reasonLabels: Record<string, string> = {
  gender_missing: "Gender missing",
  gender_mismatch: "Gender mismatch",
  dob_missing: "DOB missing",
  age_above_max: "Above age limit",
  age_below_min: "Below age limit",
  unrated_excluded: "Unrated not allowed",
  rating_below_min: "Rating below minimum",
  rating_above_max: "Rating above maximum",
  disability_excluded: "Disability not eligible",
  city_excluded: "City not eligible",
  state_excluded: "State not eligible",
  club_excluded: "Club not eligible",
  no_eligible_players: "No eligible players",
};

const formatReasonCode = (code: string): string => {
  if (reasonLabels[code]) return reasonLabels[code];
  return code
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export function IneligibilityTooltip({ reasonCodes }: IneligibilityTooltipProps) {
  if (!reasonCodes || reasonCodes.length === 0) {
    return null;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button className="inline-flex items-center justify-center hover:bg-muted rounded-full p-1 transition-colors">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">View ineligibility reasons</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Ineligibility Reasons</h4>
          <p className="text-xs text-muted-foreground">
            This prize is unfilled or players were excluded for the following reasons:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {reasonCodes.map((code, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {formatReasonCode(code)}
              </Badge>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
