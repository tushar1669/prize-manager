import React from 'react';
import { Users, Trophy, Medal, Award, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Re-export types from shared hook for convenience
export type {
  TeamPlayerInfo,
  WinnerInstitution,
  GroupConfig,
  PrizeWithWinner,
  GroupResponse,
  TeamPrizeResultsResponse,
} from '@/components/team-prizes/useTeamPrizeResults';

import type {
  TeamPrizeResultsResponse,
  GroupResponse,
} from '@/components/team-prizes/useTeamPrizeResults';

interface TeamPrizeResultsPanelProps {
  data: TeamPrizeResultsResponse | null;
  isLoading?: boolean;
  error?: string | null;
}

const GROUP_BY_LABELS: Record<string, string> = {
  club: 'School / Academy / Club',
  city: 'City',
  state: 'State',
  group_label: 'Swiss Group (Gr)',
  type_label: 'Swiss Type',
};

function getPlaceOrdinal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function GroupCard({ group }: { group: GroupResponse }) {
  const [expanded, setExpanded] = React.useState(true);
  const [showIneligible, setShowIneligible] = React.useState(false);

  const filledPrizes = group.prizes.filter(p => p.winner_institution !== null);
  const unfilledPrizes = group.prizes.filter(p => p.winner_institution === null);
  const totalCash = filledPrizes.reduce((sum, p) => sum + p.cash_amount, 0);

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-base flex items-center gap-2 cursor-pointer">
                  <Users className="h-4 w-4" />
                  {group.name}
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardTitle>
              </Button>
            </CollapsibleTrigger>
          </div>

          {/* Config badges */}
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="secondary">{GROUP_BY_LABELS[group.config.group_by] || group.config.group_by}</Badge>
            <Badge variant="outline">Top {group.config.team_size} players</Badge>
            {(group.config.female_slots > 0 || group.config.male_slots > 0) && (
              <Badge variant="outline">
                {group.config.female_slots > 0 && `${group.config.female_slots}F`}
                {group.config.female_slots > 0 && group.config.male_slots > 0 && ' + '}
                {group.config.male_slots > 0 && `${group.config.male_slots}M`}
                {' required'}
              </Badge>
            )}
            <Badge variant="secondary">
              {group.eligible_institutions} eligible institution{group.eligible_institutions !== 1 ? 's' : ''}
            </Badge>
            {filledPrizes.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-primary/20">
                {filledPrizes.length} winner{filledPrizes.length !== 1 ? 's' : ''} • {formatCurrency(totalCash)}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Winners table */}
            {filledPrizes.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Place</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-right">Rank Sum</TableHead>
                      <TableHead className="text-right">Best Rank</TableHead>
                      <TableHead className="text-right">Prize</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filledPrizes.map((prize) => {
                      const winner = prize.winner_institution!;
                      return (
                        <React.Fragment key={prize.id}>
                          <TableRow>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1">
                                {prize.place === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                                {prize.place === 2 && <Medal className="h-4 w-4 text-gray-400" />}
                                {prize.place === 3 && <Award className="h-4 w-4 text-amber-600" />}
                                {getPlaceOrdinal(prize.place)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{winner.label}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {winner.players.map((p, i) => (
                                  <span key={p.player_id}>
                                    {i > 0 && ', '}
                                    {p.name}
                                    <span className="text-muted-foreground/70"> (#{p.rank})</span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {winner.total_points}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {winner.rank_sum}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              #{winner.best_individual_rank}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {prize.cash_amount > 0 && (
                                  <span className="font-medium">{formatCurrency(prize.cash_amount)}</span>
                                )}
                                {prize.has_trophy && <Trophy className="h-3.5 w-3.5 text-yellow-500" />}
                                {prize.has_medal && <Medal className="h-3.5 w-3.5 text-gray-400" />}
                              </div>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200">No eligible institutions found</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300 mt-2">
                  <p className="mb-2">Common causes:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>Missing "{GROUP_BY_LABELS[group.config.group_by] || group.config.group_by}" data</strong> – players may not have this field populated in the import</li>
                    {(group.config.female_slots > 0 || group.config.male_slots > 0) && (
                      <li><strong>Gender requirements impossible</strong> – not enough female ({group.config.female_slots}) or male ({group.config.male_slots}) players per institution</li>
                    )}
                    <li><strong>Team size too large</strong> – institutions need at least {group.config.team_size} players to qualify</li>
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Unfilled prizes */}
            {unfilledPrizes.length > 0 && (
              <Alert variant="default" className="border-muted">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{unfilledPrizes.length} unfilled prize{unfilledPrizes.length !== 1 ? 's' : ''}</AlertTitle>
                <AlertDescription>
                  Not enough eligible institutions to fill all places.
                </AlertDescription>
              </Alert>
            )}

            {/* Ineligible institutions */}
            {group.ineligible_institutions > 0 && group.ineligible_reasons.length > 0 && (
              <Collapsible open={showIneligible} onOpenChange={setShowIneligible}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    {showIneligible ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                    {group.ineligible_institutions} ineligible institution{group.ineligible_institutions !== 1 ? 's' : ''}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 text-sm text-muted-foreground space-y-1 pl-4 border-l-2 border-muted">
                    {group.ineligible_reasons.slice(0, 5).map((reason, i) => (
                      <p key={i}>• {reason}</p>
                    ))}
                    {group.ineligible_reasons.length > 5 && (
                      <p className="italic">...and {group.ineligible_reasons.length - 5} more</p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function TeamPrizeResultsPanel({ data, isLoading, error }: TeamPrizeResultsPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading team prize results...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load team prizes</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data || data.groups.length === 0) {
    return null; // No team prizes configured - don't show anything
  }

  const totalWinners = data.groups.reduce(
    (sum, g) => sum + g.prizes.filter(p => p.winner_institution !== null).length,
    0
  );
  const totalCash = data.groups.reduce(
    (sum, g) => sum + g.prizes.filter(p => p.winner_institution !== null).reduce((s, p) => s + p.cash_amount, 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team / Institution Prizes
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.groups.length} group{data.groups.length !== 1 ? 's' : ''}</Badge>
          {totalWinners > 0 && (
            <Badge className="bg-primary/10 text-primary border-primary/20">
              {totalWinners} winner{totalWinners !== 1 ? 's' : ''} • {formatCurrency(totalCash)}
            </Badge>
          )}
        </div>
      </div>

      <Alert className="border-muted bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Team prizes are allocated separately from individual prizes. Players can win both individual AND team prizes.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {data.groups.map((group) => (
          <GroupCard key={group.group_id} group={group} />
        ))}
      </div>
    </div>
  );
}
