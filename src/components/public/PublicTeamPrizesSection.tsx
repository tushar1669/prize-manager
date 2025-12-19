import { Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamPrizeResultsPanel } from '@/components/allocation/TeamPrizeResultsPanel';
import { usePublicTeamPrizes } from '@/hooks/usePublicTeamPrizes';

interface PublicTeamPrizesSectionProps {
  tournamentId: string;
}

export function PublicTeamPrizesSection({ tournamentId }: PublicTeamPrizesSectionProps) {
  const { data, isLoading, error } = usePublicTeamPrizes(tournamentId);

  // Don't render anything if no team prizes
  if (!isLoading && (!data || !data.hasTeamPrizes || data.groups.length === 0)) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Team / Institution Prizes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading team prizes…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    // Silently fail on public pages - don't show error to visitors
    console.error('[PublicTeamPrizesSection] Error loading team prizes:', error);
    return null;
  }

  return (
    <Card className="mt-8">
      <CardContent className="pt-6">
        <TeamPrizeResultsPanel
          data={data}
          isLoading={false}
          error={null}
        />
      </CardContent>
    </Card>
  );
}
