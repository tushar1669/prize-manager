import { useState, useEffect, useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { TeamPrizeResultsPanel } from '@/components/allocation/TeamPrizeResultsPanel';
import { TeamTieBreakDialog } from '@/components/allocation/TeamTieBreakDialog';
import { useTeamPrizeResults } from '@/components/team-prizes/useTeamPrizeResults';
import type { GroupResponse } from '@/components/team-prizes/useTeamPrizeResults';
import type { TieInfo } from '@/utils/teamTieDetection';
import { hasUnresolvedTeamTies } from '@/utils/teamTieDetection';
import { Loader2, Users } from 'lucide-react';

interface TeamPrizesTabViewProps {
  tournamentId: string;
  allocationVersion?: number;
  /** Called whenever the pending-tie state changes */
  onPendingTiesChange?: (hasPending: boolean) => void;
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
}

export function TeamPrizesTabView({ tournamentId, allocationVersion, onPendingTiesChange, showDiagnostics = false }: TeamPrizesTabViewProps) {
  const {
    hasTeamPrizes,
    checkingTeamPrizes,
    data,
    isLoading,
    error,
  } = useTeamPrizeResults(tournamentId, { enabled: true, allocationVersion });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupResponse | null>(null);
  const [selectedTieInfo, setSelectedTieInfo] = useState<TieInfo | null>(null);

  const hasPending = useMemo(
    () => data ? hasUnresolvedTeamTies(data.groups) : false,
    [data]
  );

  useEffect(() => {
    onPendingTiesChange?.(hasPending);
  }, [hasPending, onPendingTiesChange]);

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
    <div className="mx-auto mt-8 max-w-6xl px-6 pb-12 print:mt-3 print:px-0 print:pb-4">
      <TeamPrizeResultsPanel
        data={data}
        isLoading={false}
        error={null}
        showDiagnostics={showDiagnostics}
        tournamentId={tournamentId}
        allocationVersion={allocationVersion}
        onTieResolutionRequest={handleTieResolutionRequest}
      />

      {selectedGroup && selectedTieInfo && (
        <TeamTieBreakDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tournamentId={tournamentId}
          version={allocationVersion ?? 1}
          group={selectedGroup}
          tieInfo={selectedTieInfo}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
