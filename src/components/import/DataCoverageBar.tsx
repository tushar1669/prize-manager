import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface DataCoverageBarProps {
  coverage: {
    dob: number;
    gender: number;
    rating: number;
    state: number;
    city: number;
    club: number;
    group_label: number;
    type_label: number;
  };
  ruleUsedFields?: Set<string>;
  teamGroupByFields?: string[];
}

function CoverageChip({ label, percent, starred }: { label: string; percent: number; starred?: boolean }) {
  const color = percent >= 0.8 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                percent >= 0.5 ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                'bg-red-50 text-red-700 border-red-200';
  
  return (
    <div className="text-center">
      <Badge variant="outline" className={`${color} text-base px-3 py-1 font-semibold`}>
        {percent.toFixed(0)}%
      </Badge>
      <div className="text-xs text-muted-foreground mt-1">
        {label}{starred ? ' ★' : ''}
      </div>
    </div>
  );
}

export function DataCoverageBar({ coverage, ruleUsedFields, teamGroupByFields }: DataCoverageBarProps) {
  const rules = ruleUsedFields ?? new Set<string>();
  const teamFields = teamGroupByFields ?? [];

  const conditionalChips: { label: string; field: keyof typeof coverage }[] = [];

  if (rules.has('club') || teamFields.includes('club')) {
    conditionalChips.push({ label: 'Club', field: 'club' });
  }
  if (rules.has('group_label') || teamFields.includes('group_label')) {
    conditionalChips.push({ label: 'Group (Gr)', field: 'group_label' });
  }
  if (rules.has('type_label') || teamFields.includes('type_label')) {
    conditionalChips.push({ label: 'Type', field: 'type_label' });
  }
  if (rules.has('state')) {
    conditionalChips.push({ label: 'State', field: 'state' });
  }
  if (rules.has('city')) {
    conditionalChips.push({ label: 'City', field: 'city' });
  }

  const hasConditional = conditionalChips.length > 0;

  return (
    <Card className="border-muted">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Data Coverage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Always-show chips */}
          <CoverageChip label="DOB" percent={coverage.dob * 100} />
          <CoverageChip label="Gender" percent={coverage.gender * 100} />
          <CoverageChip label="Rated" percent={coverage.rating * 100} />
          {/* Conditional chips */}
          {conditionalChips.map(c => (
            <CoverageChip key={c.field} label={c.label} percent={coverage[c.field] * 100} starred />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          {hasConditional
            ? 'Fields marked ★ are needed by your prize rules'
            : 'Configure prize categories to see rule-specific coverage'}
        </p>
      </CardContent>
    </Card>
  );
}
