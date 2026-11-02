import { useState, useMemo } from 'react';
import './TeamPrizesTabView.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { TeamPrizeResultsPanel } from '@/components/allocation/TeamPrizeResultsPanel';
import { TeamTieBreakDialog } from '@/components/allocation/TeamTieBreakDialog';
import { useTeamPrizeResults } from '@/components/team-prizes/useTeamPrizeResults';
import type { GroupResponse, TeamPrizeResultsResponse } from '@/components/team-prizes/useTeamPrizeResults';
import type { TieInfo } from '@/utils/teamTieDetection';
import { Loader2, Users } from 'lucide-react';

interface TeamPrizesTabViewProps {
  tournamentId: string;
  allocationVersion?: number;
  /**
   * Organizer-only diagnostics — the list of institutions that did not qualify.
   *
   * Defaults to FALSE, and the default is the point: this component is rendered by
   * BOTH Finalize (a working review surface) and FinalPrizeView (the print/handout
   * artifact, `FinalPrizeView.tsx:124`). Gating on the component rather than on the
   * surface would put the list of schools that failed to qualify onto a printed
   * page, which carries the same reputational risk as publishing it. Only
   * `src/pages/Finalize.tsx` passes this true.
   */
  showDiagnostics?: boolean;
  /**
   * Forwarded to TeamPrizeResultsPanel. Defaults to true (unmasked), matching
   * pre-TC1.6 behaviour for any caller that doesn't pass it. FinalPrizeView and
   * Finalize both pass their own `useTournamentAccess().hasFullAccess` through —
   * see `selectVisibleTeamPrizes` for the masking rule this gates.
   */
  hasFullAccess?: boolean;
}

/**
 * A saved version stores only decided places. On the organizer's Finalize view,
 * add the current scorer's ties and issues so places it could not decide can be
 * settled in the tie dialog.
 */
function withCurrentTies(
  saved: TeamPrizeResultsResponse | null | undefined,
  current: TeamPrizeResultsResponse | null | undefined,
): TeamPrizeResultsResponse | null | undefined {
  if (!saved || !current) return saved;
  const currentById = new Map(current.groups.map(group => [group.group_id, group]));
  return {
    ...saved,
    groups: saved.groups.map(group => {
      const live = currentById.get(group.group_id);
      return live ? { ...group, ranking_ties: live.ranking_ties, ranking_issues: live.ranking_issues } : group;
    }),
  };
}

export function TeamPrizesTabView({ tournamentId, allocationVersion, showDiagnostics = false, hasFullAccess = true }: TeamPrizesTabViewProps) {
  const {
    hasTeamPrizes,
    checkingTeamPrizes,
    data: savedData,
    isLoading,
    error,
  } = useTeamPrizeResults(tournamentId, { enabled: true, allocationVersion });
  const { data: currentData } = useTeamPrizeResults(tournamentId, {
    enabled: showDiagnostics && allocationVersion !== undefined,
  });
  const data = useMemo(
    () => (showDiagnostics && allocationVersion !== undefined ? withCurrentTies(savedData, currentData) : savedData),
    [showDiagnostics, allocationVersion, savedData, currentData],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupResponse | null>(null);
  const [selectedTieInfo, setSelectedTieInfo] = useState<TieInfo | null>(null);

  const handleTieResolutionRequest = (group: GroupResponse, tieInfo: TieInfo) => {
    setSelectedGroup(group);
    setSelectedTieInfo(tieInfo);
    setDialogOpen(true);
  };

  const handleResolved = () => {
    setDialogOpen(false);
    setSelectedGroup(null);
    setSelectedTieInfo(null);
  };

  // Loading state while checking if team prizes exist
  if (checkingTeamPrizes) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking for team prizes…
      </div>
    );
  }

  // No team prize groups configured
  if (!hasTeamPrizes) {
    return (
      <Card className="mx-auto mt-8 max-w-3xl">
        <CardContent className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No Team Prizes Configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This tournament does not have any team prize groups set up.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="mx-auto mt-8 max-w-3xl">
        <AlertDescription>
          Failed to load team prize results: {error}
        </AlertDescription>
      </Alert>
    );
  }

  // Loading team prize results
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading team prize results…
      </div>
    );
  }

  // Render team prize results
  return (
    <div className="pm-team-prizes-print mx-auto mt-8 max-w-6xl px-6 pb-12 print:mt-3 print:px-0 print:pb-4">
      <TeamPrizeResultsPanel
        data={data}
        isLoading={false}
        error={null}
        showDiagnostics={showDiagnostics}
        hasFullAccess={hasFullAccess}
        tournamentId={tournamentId}
        allocationVersion={allocationVersion}
        // Ties are settled on a finalized version only.
        onTieResolutionRequest={showDiagnostics && hasFullAccess && allocationVersion !== undefined
          ? handleTieResolutionRequest : undefined}
      />

      {selectedGroup && selectedTieInfo && allocationVersion !== undefined && (
        <TeamTieBreakDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tournamentId={tournamentId}
          version={allocationVersion}
          group={selectedGroup}
          tieInfo={selectedTieInfo}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
