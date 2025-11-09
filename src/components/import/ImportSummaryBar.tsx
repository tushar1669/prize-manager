import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface ImportSummaryBarProps {
  totalPlayers: number;
  validPlayers: number;
  errorCount: number;
  statesExtracted?: number;
}

export function ImportSummaryBar({ 
  totalPlayers, 
  validPlayers, 
  errorCount,
  statesExtracted 
}: ImportSummaryBarProps) {
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
      </CardContent>
    </Card>
  );
}
