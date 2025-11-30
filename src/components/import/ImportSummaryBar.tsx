import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";

interface ImportSummaryBarProps {
  totalPlayers: number;
  validPlayers: number;
  errorCount: number;
  statesExtracted?: number;
  femaleFromGender?: number | null;
  femaleFromFmg?: number | null;
}

export function ImportSummaryBar({
  totalPlayers,
  validPlayers,
  errorCount,
  statesExtracted,
  femaleFromGender,
  femaleFromFmg
}: ImportSummaryBarProps) {
  const femaleFromGenderCount = femaleFromGender ?? 0;
  const femaleFromFmgCount = femaleFromFmg ?? 0;

  const hasFemaleCounts = femaleFromGender != null && femaleFromFmg != null;
  const femaleDifference = Math.abs(femaleFromGenderCount - femaleFromFmgCount);
  const hasFemaleMismatch =
    hasFemaleCounts &&
    femaleFromGenderCount > 0 &&
    femaleFromFmgCount > 0 &&
    femaleDifference > 1;
  const hasMissingGender = hasFemaleCounts && femaleFromGenderCount === 0 && femaleFromFmgCount > 0;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-3">
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="flex items-center gap-1.5">
            {errorCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="font-medium">Players:</span>
            <span className="text-muted-foreground">{totalPlayers}</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Valid:</span>
            <span className="text-primary font-semibold">{validPlayers}</span>
          </div>
          <span className="text-muted-foreground">•</span>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Errors:</span>
            <span className={errorCount === 0 ? "text-primary font-semibold" : "text-destructive font-semibold"}>
              {errorCount}
            </span>
          </div>
          {statesExtracted !== undefined && statesExtracted > 0 && (
            <>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Auto-extracted state:</span>
                <span className="text-primary font-semibold">{statesExtracted}</span>
              </div>
            </>
          )}
        </div>
        {(hasFemaleMismatch || hasMissingGender) && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              hasMissingGender
                ? 'border-destructive/50 bg-destructive/10 text-destructive'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="space-y-1">
              <div className="font-semibold">
                {hasMissingGender ? 'Gender column missing female values' : 'Female counts look mismatched'}
              </div>
              <div className="text-xs sm:text-sm">
                Gender column shows <strong>{femaleFromGenderCount}</strong> female
                {femaleFromGenderCount === 1 ? '' : 's'}, Type/Gr (FMG) shows <strong>{femaleFromFmgCount}</strong>.
                {hasFemaleMismatch && !hasMissingGender && ' Please double-check your gender and Type/Group mapping.'}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
