import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { formatReasonCode } from "@/utils/reasonCodeLabels";

interface Unfilled {
  prizeId: string;
  reasonCodes: string[];
}

interface Prize {
  id: string;
  place: number;
  cash_amount: number | null;
  has_trophy: boolean | null;
  has_medal: boolean | null;
  category_name: string;
}

interface Category {
  id: string;
  name: string;
}

interface UnfilledPrizesPanelProps {
  unfilled: Unfilled[];
  prizes: Prize[];
  categories?: Category[];
}

export function UnfilledPrizesPanel({ unfilled, prizes, categories }: UnfilledPrizesPanelProps) {
  // Success state: all prizes allocated
  if (unfilled.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-900">
            All prizes were allocated successfully
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group unfilled prizes by category
  const unfilledByCategory: Record<string, Array<{ prize: Prize; reasons: string[] }>> = {};
  
  unfilled.forEach(u => {
    const prize = prizes.find(p => p.id === u.prizeId);
    if (!prize) return;
    
    const categoryName = prize.category_name || "Unknown Category";
    if (!unfilledByCategory[categoryName]) {
      unfilledByCategory[categoryName] = [];
    }
    
    unfilledByCategory[categoryName].push({
      prize,
      reasons: u.reasonCodes || []
    });
  });

  // Helper to format prize summary
  const formatPrizeSummary = (prize: Prize) => {
    const parts: string[] = [];
    
    if (prize.cash_amount && Number(prize.cash_amount) > 0) {
      parts.push(`₹${prize.cash_amount}`);
    }
    if (prize.has_trophy) {
      parts.push("Trophy");
    }
    if (prize.has_medal) {
      parts.push("Medal");
    }
    
    return parts.length > 0 ? parts.join(" + ") : "—";
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-foreground">
            Unfilled Prizes ({unfilled.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(unfilledByCategory).map(([categoryName, items]) => (
          <div key={categoryName} className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{categoryName}</h4>
            <div className="space-y-2 pl-2">
              {items.map(({ prize, reasons }) => (
                <div
                  key={prize.id}
                  className="flex flex-wrap items-start gap-2 rounded-md border border-amber-200 bg-background p-3 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {prize.place === 1 ? "1st" : prize.place === 2 ? "2nd" : prize.place === 3 ? "3rd" : `${prize.place}th`}
                      </Badge>
                      <span className="font-medium text-foreground">
                        {formatPrizeSummary(prize)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {reasons.slice(0, 2).map((code, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs bg-amber-100 text-amber-800 border-amber-200"
                        >
                          {formatReasonCode(code)}
                        </Badge>
                      ))}
                      {reasons.length > 2 && (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          +{reasons.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
