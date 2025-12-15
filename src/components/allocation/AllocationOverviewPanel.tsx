import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Info, Users, Calendar, Star, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RuleConfig {
  age_band_policy?: string | null;
  multi_prize_policy?: string | null;
  strict_age?: boolean;
  allow_missing_dob_for_age?: boolean;
  max_age_inclusive?: boolean;
  prefer_main_on_equal_value?: boolean;
  prefer_category_rank_on_tie?: boolean;
  allow_unrated_in_rating?: boolean;
}

interface Player {
  id: string;
  dob?: string | null;
  dob_raw?: string | null;
  gender?: string | null;
  rating?: number | null;
}

interface Props {
  ruleConfig?: RuleConfig | null;
  players?: Player[];
  className?: string;
}

type CoverageLevel = 'good' | 'moderate' | 'poor';

function getCoverageLevel(percent: number): CoverageLevel {
  if (percent >= 90) return 'good';
  if (percent >= 60) return 'moderate';
  return 'poor';
}

function CoverageBar({ label, count, total, icon: Icon }: { 
  label: string; 
  count: number; 
  total: number;
  icon: React.ElementType;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const level = getCoverageLevel(percent);
  
  const colorClasses = {
    good: 'bg-emerald-500',
    moderate: 'bg-amber-500',
    poor: 'bg-red-500',
  };
  
  const textClasses = {
    good: 'text-emerald-700',
    moderate: 'text-amber-700',
    poor: 'text-red-700',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className={cn('font-medium', textClasses[level])}>
          {count}/{total} ({percent}%)
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all', colorClasses[level])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CoverageWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Read-only panel summarizing allocation configuration and field coverage.
 * Helps organizers understand why some prizes may remain unfilled.
 */
export function AllocationOverviewPanel({ ruleConfig, players, className }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  
  const coverage = useMemo(() => {
    if (!players || players.length === 0) {
      return { total: 0, withDob: 0, withGender: 0, withRating: 0, females: 0 };
    }
    
    let withDob = 0;
    let withGender = 0;
    let withRating = 0;
    let females = 0;
    
    for (const p of players) {
      if (p.dob || p.dob_raw) withDob++;
      if (p.gender) {
        withGender++;
        if (p.gender.toUpperCase() === 'F') females++;
      }
      if (p.rating != null && p.rating > 0) withRating++;
    }
    
    return { total: players.length, withDob, withGender, withRating, females };
  }, [players]);

  const warnings = useMemo(() => {
    const msgs: string[] = [];
    if (coverage.total === 0) return msgs;
    
    const dobPct = Math.round((coverage.withDob / coverage.total) * 100);
    const genderPct = Math.round((coverage.withGender / coverage.total) * 100);
    
    if (dobPct < 60) {
      msgs.push(`Only ${dobPct}% of players have DOB. Age-based prizes may remain unfilled.`);
    } else if (dobPct < 90) {
      msgs.push(`${100 - dobPct}% of players are missing DOB. Some age prizes may be affected.`);
    }
    
    if (genderPct < 60) {
      msgs.push(`Only ${genderPct}% of players have gender. Girls-only prizes may remain unfilled.`);
    }
    
    if (coverage.females === 0 && coverage.total > 0) {
      msgs.push(`No female players detected. Girls-only and Best Female prizes will be unfilled.`);
    }
    
    return msgs;
  }, [coverage]);

  const rc = ruleConfig || {};
  const ageBandPolicy = rc.age_band_policy || 'non_overlapping';
  const multiPrizePolicy = rc.multi_prize_policy || 'single';
  
  const prizeStackingLabel = multiPrizePolicy === 'unlimited' 
    ? 'Unlimited stacking' 
    : multiPrizePolicy === 'main_plus_one_side' 
      ? 'Main + one extra prize' 
      : 'One prize per player';

  return (
    <Card className={cn('border-muted', className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Allocation Overview
                <Badge variant="outline" className="text-xs font-normal">Informational</Badge>
              </CardTitle>
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">
            {/* Rules Summary */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">Rule Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-muted-foreground">Age Band Policy</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={ageBandPolicy === 'non_overlapping' ? 'default' : 'secondary'} className="text-xs">
                      {ageBandPolicy === 'non_overlapping' ? 'Non-overlapping' : 'Overlapping'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ageBandPolicy === 'non_overlapping' 
                      ? 'Each child fits exactly one Under-X band (U8, U11, U14, etc.)'
                      : 'Child can qualify for multiple Under-X bands simultaneously'
                    }
                  </p>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">Gender Semantics</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs bg-muted/50">Any = All</Badge>
                    <Badge variant="outline" className="text-xs bg-pink-50 text-pink-700 border-pink-200">Girls = F only</Badge>
                    <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">Boys = not F</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Boys (not F) includes males and unknown gender
                  </p>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">Prize Stacking</span>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={multiPrizePolicy === 'single' ? 'default' : 'secondary'} 
                      className="text-xs"
                    >
                      {prizeStackingLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {multiPrizePolicy === 'single' 
                      ? 'Each player receives at most one prize'
                      : multiPrizePolicy === 'main_plus_one_side'
                        ? 'Player can win one main + one side prize'
                        : 'No limit on prizes per player'
                    }
                  </p>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">Tie-break Strategy</span>
                  <p className="text-xs">
                    {rc.prefer_main_on_equal_value 
                      ? 'Prefer Main category when values are equal'
                      : 'No main category preference on ties'
                    }
                  </p>
                </div>
                
                <div className="space-y-1">
                  <span className="text-muted-foreground">Age Handling</span>
                  <p className="text-xs">
                    {rc.strict_age ? 'Strict age enforcement' : 'Relaxed age rules'}
                    {rc.allow_missing_dob_for_age && ' · Missing DOB allowed'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Field Coverage */}
            {coverage.total > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Field Coverage</h4>
                <div className="space-y-3">
                  <CoverageBar 
                    label="Date of Birth" 
                    count={coverage.withDob} 
                    total={coverage.total}
                    icon={Calendar}
                  />
                  <CoverageBar 
                    label="Gender" 
                    count={coverage.withGender} 
                    total={coverage.total}
                    icon={UserCheck}
                  />
                  <CoverageBar 
                    label="Rating" 
                    count={coverage.withRating} 
                    total={coverage.total}
                    icon={Star}
                  />
                </div>
                {coverage.females > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {coverage.females} female player{coverage.females !== 1 ? 's' : ''} detected
                  </p>
                )}
              </div>
            )}
            
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="space-y-2">
                {warnings.map((msg, i) => (
                  <CoverageWarning key={i} message={msg} />
                ))}
              </div>
            )}
            
            {/* All Good */}
            {coverage.total > 0 && warnings.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>Field coverage looks good. Most prizes should fill correctly.</span>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
