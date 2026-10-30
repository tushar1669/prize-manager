import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { TeamPrizesTabView } from '@/components/final-prize/TeamPrizesTabView';

type OfficialRuling = { group_id: string; proposal: Record<string, unknown> };
type Status = { enabled: true; saved: false; expected_version: number };
type SaveReply = { saved: boolean; allocation_version?: number; error?: string };

const serverError = (data: unknown): string =>
  data && typeof data === 'object' && 'error' in data &&
  typeof data.error === 'string' ? data.error : 'server_unavailable';

/**
 * Admin-only experimental path, independent of the legacy Finalize page.
 * Parent route requires Master; the Edge function REVERIFIES Master+canary.
 * Nothing is automatically saved or published. No browser winner arrays.
 */
export default function TeamV2Trial() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [accepted, setAccepted] = useState(false);
  const [rulings, setRulings] = useState<OfficialRuling[]>([]);
  const [lastSavedVersion, setLastSavedVersion] = useState<number | null>(null);

  const { data: status, isPending, error: statusError, refetch } = useQuery({
    queryKey: ['master-team-v2-canary-status', id],
    enabled: !!id,
    retry: false,
    queryFn: async (): Promise<Status> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !id) throw new Error('unauthorized');
      const { data, error } = await supabase.functions.invoke('saveTeamV2', {
        body: { tournament_id: id, action: 'status', expected_version: 0 },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || data?.enabled !== true ||
          !Number.isSafeInteger(data?.expected_version)) {
        throw new Error(serverError(data));
      }
      return data as Status;
    },
  });

  const save = useMutation({
    mutationFn: async (): Promise<SaveReply> => {
      if (!status || !id || !accepted) throw new Error('not_ready');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('unauthorized');
      const { data, error } = await supabase.functions.invoke('saveTeamV2', {
        body: {
          tournament_id: id,
          expected_version: status.expected_version,
          official_rulings: rulings,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || data?.saved !== true ||
          !Number.isSafeInteger(data?.allocation_version)) {
        throw new Error(serverError(data));
      }
      return data as SaveReply;
    },
    onSuccess: async reply => {
      setLastSavedVersion(reply.allocation_version ?? null);
      setRulings([]);
      setAccepted(false);
      toast.success(`Team V2 version ${reply.allocation_version} saved. Not published.`);
      await queryClient.invalidateQueries({ queryKey: ['master-team-v2-canary-status', id] });
      await refetch();
    },
    onError: error => {
      // Avoid logging identities, player records or raw scorer payloads.
      toast.error(`No awards saved: ${error instanceof Error ? error.message : 'save_failed'}`);
      setAccepted(false);
      void refetch();
    },
  });

  const storeReviewed = (groupId: string, proposal: Record<string, unknown>) => {
    // The browser submits only an official ruling PROPOSAL. The server must
    // independently rescore, validate every tie and construct all award rows.
    setRulings(previous => [
      ...previous.filter(item => item.group_id !== groupId),
      { group_id: groupId, proposal },
    ]);
    setAccepted(false);
  };

  return (
    <div className="space-y-4">
      <Link className="text-sm underline" to="/admin/tournaments">Back to admin tournaments</Link>
      <Card>
        <CardHeader><CardTitle>Team Prizes V2 — master-only test</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only test tournaments explicitly enabled by an administrator in the database
            can use this workflow. It never invokes legacy finalize or publishes results.
          </p>
          {isPending && <p>Checking administrator-only trial status…</p>}
          {statusError && (
            <Alert variant="destructive"><AlertDescription>
              Trial unavailable: {statusError.message}. No prizes were saved.
            </AlertDescription></Alert>
          )}
          {status && (
            <>
              <p className="font-medium">
                Current saved version: {status.expected_version}. Next version: {status.expected_version + 1}.
              </p>
              <p className="text-sm">
                Official tie decisions checked below: {rulings.length}.
                Unresolved or unverified tie-break evidence prevents Save.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox id="team-v2-confirm" checked={accepted}
                  onCheckedChange={value => setAccepted(value === true)} />
                <label htmlFor="team-v2-confirm" className="text-sm">
                  I reviewed the tournament scores and official rules. Create a new
                  private allocation version; do not publish it.
                </label>
              </div>
              <Button onClick={() => save.mutate()} disabled={!accepted || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save Team V2 allocation version'}
              </Button>
            </>
          )}
          {lastSavedVersion !== null && (
            <Alert><AlertDescription>
              Team V2 allocation version {lastSavedVersion} saved. Publication was not changed.
            </AlertDescription></Alert>
          )}
        </CardContent>
      </Card>
      {status && id && (
        <TeamPrizesTabView tournamentId={id} showDiagnostics hasFullAccess
          onV2OfficialRulingReviewed={storeReviewed} />
      )}
    </div>
  );
}
