import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DataCoverageBarProps {
  coverage: {
    dob: number;
    gender: number;
    state: number;
    city: number;
    federation: number;
  };
}

function CoverageChip({ label, percent }: { label: string; percent: number }) {
  const color = percent >= 0.8 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                percent >= 0.5 ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                'bg-red-50 text-red-700 border-red-200';
  
  return (
    <div className="text-center">
      <Badge variant="outline" className={`${color} text-base px-3 py-1 font-semibold`}>
        {percent.toFixed(0)}%
      </Badge>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function DataCoverageBar({ coverage }: DataCoverageBarProps) {
  return (
    <Card className="border-muted">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Data Coverage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <CoverageChip label="DOB" percent={coverage.dob * 100} />
          <CoverageChip label="Gender" percent={coverage.gender * 100} />
          <CoverageChip label="State" percent={coverage.state * 100} />
          <CoverageChip label="City" percent={coverage.city * 100} />
          <CoverageChip label="Federation" percent={coverage.federation * 100} />
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Percentage of players with data in each field
        </p>
      </CardContent>
    </Card>
  );
}
