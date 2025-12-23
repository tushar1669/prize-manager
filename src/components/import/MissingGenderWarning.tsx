import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GENDER_DETECTION_TOOLTIP } from "@/components/import/MissingGenderWarning.helpers";

interface MissingGenderWarningProps {
  femaleCount: number;
  totalPlayers: number;
  hasFemaleCategories: boolean;
}

/**
 * Shows a warning when no female players are detected in the import.
 * - High severity (error) if there are female/girl prize categories configured
 * - Low severity (info) if no female categories exist
 */
export function MissingGenderWarning({
  femaleCount,
  totalPlayers,
  hasFemaleCategories,
}: MissingGenderWarningProps) {
  // Only show when femaleCount === 0 and we have players
  if (femaleCount > 0 || totalPlayers === 0) {
    return null;
  }

  const isHighSeverity = hasFemaleCategories;

  return (
    <Alert variant={isHighSeverity ? "destructive" : "default"} className="my-3">
      {isHighSeverity ? (
        <AlertTriangle className="h-4 w-4" />
      ) : (
        <Info className="h-4 w-4" />
      )}
      <AlertTitle className="flex items-center gap-2">
        No female players detected
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-sm">
              {GENDER_DETECTION_TOOLTIP}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        {isHighSeverity ? (
          <>
            <p>
              This ranking list has <strong>0</strong> players marked as female, but your prize 
              structure includes girl/women categories.
            </p>
            <p className="text-sm">
              Double-check the Swiss-Manager export: make sure the gender column (F), FS column, 
              or girl groups (FMG, F9, F13…) are filled. If the file is missing gender data, 
              you'll need to correct it in Swiss-Manager or manually set player genders before 
              awarding these prizes.
            </p>
          </>
        ) : (
          <>
            <p>
              This ranking list has <strong>0</strong> players marked as female.
            </p>
            <p className="text-sm">
              If this looks wrong, check that your Swiss-Manager file includes an F in the 
              gender/FS column or a girl/women group (FMG, F9, F13, etc.), then re-upload.
            </p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
