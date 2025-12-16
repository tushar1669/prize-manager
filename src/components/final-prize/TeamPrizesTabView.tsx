import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { TeamPrizeResultsPanel } from '@/components/allocation/TeamPrizeResultsPanel';
import { useTeamPrizeResults } from '@/components/team-prizes/useTeamPrizeResults';
import { Loader2, Users } from 'lucide-react';

interface TeamPrizesTabViewProps {
  tournamentId: string;
}

export function TeamPrizesTabView({ tournamentId }: TeamPrizesTabViewProps) {
  const {
    hasTeamPrizes,
    checkingTeamPrizes,
    data,
    isLoading,
    error,
  } = useTeamPrizeResults(tournamentId, { enabled: true });

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
            This tournament does not have any team or institution prize groups set up.
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
      />
    </div>
  );
}
