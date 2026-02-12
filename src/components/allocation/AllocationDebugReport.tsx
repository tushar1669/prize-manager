import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Info,
  Layers,
  AlertCircle,
  Download,
  FileSearch
} from 'lucide-react';
import { toast } from 'sonner';
import { IneligibilityTooltip } from './IneligibilityTooltip';
import type { AllocationCoverageEntry, CategorySummary, UnfilledReasonCode } from '@/types/allocation';
import { getReasonLabel } from '@/types/allocation';
import { exportCoverageToXlsx } from '@/utils/allocationCoverageExport';
import { exportRcaToXlsx } from '@/utils/allocationRcaExport';
import { buildRcaRows, type WinnerEntry, type PlayerInfo } from '@/types/rca';

interface AllocationDebugReportProps {
  coverage: AllocationCoverageEntry[];
  totalPlayers: number;
  totalPrizes: number;
  tournamentSlug?: string;
  tournamentTitle?: string;
  winners?: WinnerEntry[];
  players?: PlayerInfo[];
}

// Badge variant based on reason code
function getReasonBadgeVariant(code: string | null): 'destructive' | 'secondary' | 'outline' {
  if (!code) return 'outline';
  if (code === 'BLOCKED_BY_ONE_PRIZE_POLICY') return 'secondary';
  if (code.startsWith('TOO_STRICT') || code === 'NO_ELIGIBLE_PLAYERS') return 'destructive';
  return 'outline';
}

// Category row component for the "By Category" view
function CategorySection({ summary, isExpanded, onToggle }: { 
  summary: CategorySummary; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasUnfilled = summary.unfilled_prizes > 0;
  
  return (
    <div className="border rounded-lg mb-3 overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors ${
          hasUnfilled ? 'bg-destructive/5' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{summary.category_name}</span>
          {summary.is_main && <Badge variant="outline" className="text-xs">Main</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {summary.filled_prizes}/{summary.total_prizes} filled
          </Badge>
          {hasUnfilled && (
            <Badge variant="destructive" className="text-xs">
              {summary.unfilled_prizes} unfilled
            </Badge>
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Prize</th>
                <th className="text-left py-2 px-3 font-medium">Type / Amount</th>
                <th className="text-left py-2 px-3 font-medium">Winner</th>
                <th className="text-right py-2 px-3 font-medium">Before 1-prize</th>
                <th className="text-right py-2 px-3 font-medium">After 1-prize</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {summary.coverage_entries.map((entry) => (
                <tr 
                  key={entry.prize_id} 
                  className={`border-t ${entry.is_unfilled ? 'bg-destructive/5' : ''}`}
                >
                  <td className="py-2 px-3">
                    <span className="font-medium">{entry.prize_label}</span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs capitalize">
                        {entry.prize_type}
                      </Badge>
                      {entry.amount != null && entry.amount > 0 && (
                        <span className="text-muted-foreground text-xs">₹{entry.amount}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    {entry.winner_name ? (
                      <div className="text-xs">
                        <div className="font-medium">{entry.winner_name}</div>
                        <div className="text-muted-foreground">
                          Rank {entry.winner_rank ?? 'N/A'} · Rating {entry.winner_rating ?? 'N/A'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={entry.candidates_before_one_prize === 0 ? 'text-destructive font-medium' : ''}>
                      {entry.candidates_before_one_prize}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span className={
                      entry.candidates_after_one_prize === 0 && entry.candidates_before_one_prize > 0 
                        ? 'text-amber-600 font-medium' 
                        : entry.candidates_after_one_prize === 0 
                          ? 'text-destructive font-medium' 
                          : ''
                    }>
                      {entry.candidates_after_one_prize}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {entry.is_unfilled ? (
                      <Badge variant="destructive" className="text-xs">Unfilled</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                        Filled
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      {entry.reason_code && (
                        <Badge variant={getReasonBadgeVariant(entry.reason_code)} className="text-xs">
                          {getReasonLabel(entry.reason_code)}
                        </Badge>
                      )}
                      {entry.raw_fail_codes.length > 0 && (
                        <IneligibilityTooltip reasonCodes={entry.raw_fail_codes} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Unfilled prize row
function UnfilledPrizeRow({ entry }: { entry: AllocationCoverageEntry }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-destructive/5">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{entry.category_name}</span>
          <span className="text-muted-foreground">·</span>
          <span>{entry.prize_label}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className="capitalize">{entry.prize_type}</span>
          {entry.amount != null && entry.amount > 0 && <span>· ₹{entry.amount}</span>}
        </div>
        {/* Diagnosis summary for 0-candidate cases */}
        {entry.diagnosis_summary && entry.candidates_before_one_prize === 0 && (
          <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            <span className="font-medium">Diagnosis:</span> {entry.diagnosis_summary}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs">
          <div>Before: <span className={entry.candidates_before_one_prize === 0 ? 'text-destructive font-medium' : ''}>{entry.candidates_before_one_prize}</span></div>
          <div>After: <span className={entry.candidates_after_one_prize === 0 ? 'text-destructive font-medium' : ''}>{entry.candidates_after_one_prize}</span></div>
        </div>
        <Badge variant={getReasonBadgeVariant(entry.reason_code)} className="text-xs">
          {getReasonLabel(entry.reason_code)}
        </Badge>
        {entry.raw_fail_codes.length > 0 && (
          <IneligibilityTooltip reasonCodes={entry.raw_fail_codes} />
        )}
      </div>
    </div>
  );
}

// Suspicious entry row
function SuspiciousEntryRow({ entry }: { entry: AllocationCoverageEntry }) {
  const isBlocedByOnePrize = entry.is_blocked_by_one_prize;
  
  return (
    <div className={`flex items-center justify-between p-3 border rounded-lg ${
      isBlocedByOnePrize ? 'bg-amber-500/10 border-amber-300' : 'bg-destructive/5'
    }`}>
      <div className="flex items-center gap-3">
        {isBlocedByOnePrize ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{entry.category_name}</span>
            <span className="text-muted-foreground">·</span>
            <span>{entry.prize_label}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {isBlocedByOnePrize 
              ? `${entry.candidates_before_one_prize} player(s) eligible, but all already won prizes`
              : `No players match the criteria`
            }
          </div>
          {/* Diagnosis summary for 0-candidate cases */}
          {entry.diagnosis_summary && entry.candidates_before_one_prize === 0 && (
            <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
              <span className="font-medium">Diagnosis:</span> {entry.diagnosis_summary}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={isBlocedByOnePrize ? 'secondary' : 'destructive'} className="text-xs">
          {getReasonLabel(entry.reason_code)}
        </Badge>
        {entry.raw_fail_codes.length > 0 && (
          <IneligibilityTooltip reasonCodes={entry.raw_fail_codes} />
        )}
      </div>
    </div>
  );
}

export function AllocationDebugReport({ 
  coverage, 
  totalPlayers, 
  totalPrizes, 
  tournamentSlug,
  tournamentTitle,
  winners,
  players
}: AllocationDebugReportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const handleDownloadCoverage = () => {
    const success = exportCoverageToXlsx(coverage, tournamentSlug || 'tournament');
    if (success) {
      toast.success('Coverage report downloaded (.xlsx)');
    } else {
      toast.error('Failed to download coverage report');
    }
  };

  const handleDownloadRca = () => {
    if (!winners || !players) {
      toast.error('RCA data not available. Run Preview first.');
      return;
    }
    
    const rcaRows = buildRcaRows(
      coverage,
      winners,
      players,
      tournamentSlug || 'tournament',
      tournamentTitle || tournamentSlug || 'Tournament'
    );
    
    console.log('[rca-export] Exporting', rcaRows.length, 'rows for', tournamentSlug);
    
    const success = exportRcaToXlsx(rcaRows, tournamentSlug || 'tournament');
    if (success) {
      toast.success('RCA report downloaded (.xlsx)');
    } else {
      toast.error('Failed to download RCA report');
    }
  };

  const canDownloadRca = Boolean(coverage.length > 0 && winners && players);
  
  // Build category summaries
  const categorySummaries = useMemo(() => {
    const categoryMap = new Map<string, CategorySummary>();
    
    for (const entry of coverage) {
      const catId = entry.category_id || 'unknown';
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          category_id: catId,
          category_name: entry.category_name,
          is_main: entry.is_main,
          order_idx: 0, // Will be sorted by first entry appearance
          total_prizes: 0,
          filled_prizes: 0,
          unfilled_prizes: 0,
          coverage_entries: [],
        });
      }
      
      const summary = categoryMap.get(catId)!;
      summary.total_prizes++;
      if (entry.is_unfilled) {
        summary.unfilled_prizes++;
      } else {
        summary.filled_prizes++;
      }
      summary.coverage_entries.push(entry);
    }
    
    // Sort entries within each category by place
    for (const summary of categoryMap.values()) {
      summary.coverage_entries.sort((a, b) => a.prize_place - b.prize_place);
    }
    
    // Return sorted by main first, then by order of appearance
    return Array.from(categoryMap.values()).sort((a, b) => {
      if (a.is_main !== b.is_main) return a.is_main ? -1 : 1;
      return 0;
    });
  }, [coverage]);
  
  // Filter unfilled entries
  const unfilledEntries = useMemo(() => 
    coverage.filter(e => e.is_unfilled).sort((a, b) => {
      // Sort by category, then place
      if (a.category_name !== b.category_name) return a.category_name.localeCompare(b.category_name);
      return a.prize_place - b.prize_place;
    }),
    [coverage]
  );
  
  // Identify suspicious entries
  const suspiciousEntries = useMemo(() => 
    coverage.filter(e => 
      // Blocked by one-prize policy
      e.is_blocked_by_one_prize ||
      // Zero candidates for "easy" categories (likely data issue)
      (e.is_unfilled && e.candidates_before_one_prize === 0)
    ),
    [coverage]
  );
  
  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };
  
  const expandAll = () => {
    setExpandedCategories(new Set(categorySummaries.map(s => s.category_id)));
  };
  
  const collapseAll = () => {
    setExpandedCategories(new Set());
  };
  
  // No coverage data available
  if (coverage.length === 0) {
    return (
      <Alert className="mb-6 border-muted">
        <Info className="h-4 w-4" />
        <AlertTitle>Debug coverage not available</AlertTitle>
        <AlertDescription>
          Run "Preview Allocation" to see detailed coverage data.
        </AlertDescription>
      </Alert>
    );
  }
  
  const filledCount = coverage.filter(e => !e.is_unfilled).length;
  const unfilledCount = coverage.filter(e => e.is_unfilled).length;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="group flex-1 justify-between p-0 h-auto hover:bg-transparent">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5" />
                  Allocation Debug Report
                  {suspiciousEntries.length > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {suspiciousEntries.length} suspicious
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{filledCount} filled</Badge>
                  {unfilledCount > 0 && <Badge variant="secondary">{unfilledCount} unfilled</Badge>}
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-yellow-300" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-yellow-300" />
                  )}
                </div>
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 ml-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadCoverage();
                }}
              >
                <Download className="h-4 w-4 mr-1" />
                Coverage (.xlsx)
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadRca();
                      }}
                      disabled={!canDownloadRca}
                    >
                      <FileSearch className="h-4 w-4 mr-1" />
                      RCA (.xlsx)
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Engine vs final winners (for audit / RCA)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent>
            <Tabs defaultValue="by-category">
              <TabsList className="mb-4">
                <TabsTrigger value="by-category" className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  By Category
                </TabsTrigger>
                <TabsTrigger value="unfilled" className="flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Unfilled ({unfilledEntries.length})
                </TabsTrigger>
                <TabsTrigger value="suspicious" className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Suspicious ({suspiciousEntries.length})
                </TabsTrigger>
              </TabsList>
              
              {/* By Category View */}
              <TabsContent value="by-category">
                <div className="flex justify-end gap-2 mb-3">
                  <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
                  <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
                </div>
                <ScrollArea className="h-[500px] pr-4">
                  {categorySummaries.map(summary => (
                    <CategorySection
                      key={summary.category_id}
                      summary={summary}
                      isExpanded={expandedCategories.has(summary.category_id)}
                      onToggle={() => toggleCategory(summary.category_id)}
                    />
                  ))}
                </ScrollArea>
              </TabsContent>
              
              {/* Unfilled Prizes View */}
              <TabsContent value="unfilled">
                {unfilledEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-semibold">All prizes filled!</h3>
                    <p className="text-sm text-muted-foreground">Every prize has been allocated to an eligible player.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                      {unfilledEntries.map(entry => (
                        <UnfilledPrizeRow key={entry.prize_id} entry={entry} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
              
              {/* Suspicious Coverage View */}
              <TabsContent value="suspicious">
                {suspiciousEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-semibold">No suspicious entries</h3>
                    <p className="text-sm text-muted-foreground">All allocations look reasonable.</p>
                  </div>
                ) : (
                  <>
                    <Alert className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertTitle>Suspicious entries found</AlertTitle>
                      <AlertDescription className="text-sm">
                        These entries may indicate data issues or overly strict criteria. Review them carefully.
                      </AlertDescription>
                    </Alert>
                    <ScrollArea className="h-[450px] pr-4">
                      <div className="space-y-2">
                        {suspiciousEntries.map(entry => (
                          <SuspiciousEntryRow key={entry.prize_id} entry={entry} />
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
