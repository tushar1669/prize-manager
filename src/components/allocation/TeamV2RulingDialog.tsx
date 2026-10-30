import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { GroupResponse } from '@/components/team-prizes/useTeamPrizeResults';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  group: GroupResponse;
  onReviewed?: (groupId: string, proposal: Record<string, unknown>) => void;
}

const ERRORS: Record<string, string> = {
  unauthorized: 'Sign in again to review this ruling.',
  forbidden: 'Only the tournament owner or an authorized master can review a ruling.',
  not_a_tie: 'These teams no longer have a genuine unresolved tie. Refresh the results.',
  stale_version: 'The allocation changed. Refresh the results before trying again.',
  incomplete_ranking: 'Missing or unverified tie-break data must be corrected before any official ruling.',
  published_regulations_required: 'Confirm the team ranking rules and published regulation reference first.',
  incorrect_boundary: 'Prize places have changed. Refresh the results.',
  invalid_ruling: 'Provide the official arbiter decision and its explanation.',
  ranking_unavailable: 'The current team ranking could not be verified. Refresh the results.',
};

function move(keys: string[], from: number, to: number): string[] {
  if (to < 0 || to >= keys.length) return keys;
  const updated = [...keys];
  [updated[from], updated[to]] = [updated[to], updated[from]];
  return updated;
}

/** Organizer/admin-only official tie REVIEW; never a saved award or legacy RPC. */
export function TeamV2RulingDialog({ open, onOpenChange, tournamentId, group, onReviewed }: Props) {
  const ties = group.adjudication_ties ?? [];
  const [tieIndex, setTieIndex] = useState(0);
  const tie = ties[tieIndex];
  const [order, setOrder] = useState<string[]>([]);
  const [decisionReference, setDecisionReference] = useState('');
  const [explanation, setExplanation] = useState('');
  const [checking, setChecking] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTieIndex(0);
    setOrder(ties[0]?.team_keys ?? []);
    setDecisionReference('');
    setExplanation('');
    setReviewed(false);
    setError(null);
  }, [open, group.group_id]); // Reset only when opening a different team group.

  const chooseTie = (index: number) => {
    setTieIndex(index);
    setOrder(ties[index]?.team_keys ?? []);
    setReviewed(false);
    setError(null);
  };

  const reviewRuling = async () => {
    if (!tie || !decisionReference.trim() || !explanation.trim()) return;
    setChecking(true);
    setReviewed(false);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('unauthorized');
      const { data, error: functionError } = await supabase.functions.invoke('prepareTeamRulingV2', {
        body: {
          tournament_id: tournamentId,
          group_id: group.group_id,
          proposal: {
            group_id: group.group_id,
            tied_team_keys: tie.team_keys,
            ordered_team_keys: order,
            affected_places: tie.affected_places,
            method: 'documented_arbiter_ruling',
            regulation_reference: group.adjudication_rules_reference ?? '',
            arbiter_decision_reference: decisionReference.trim(),
            explanation: explanation.trim(),
          },
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // Failed HTTP responses can carry a safe fixed error code.
      const code = typeof data?.error === 'string' ? data.error : null;
      if (functionError || data?.ok !== true || data?.saved !== false) {
        throw new Error(code ?? 'ranking_unavailable');
      }
      if (!data?.review || !Number.isSafeInteger(data.review.proposed_new_version)) {
        throw new Error('stale_version');
      }
      onReviewed?.(group.group_id, {
        group_id: group.group_id,
        tied_team_keys: tie.team_keys,
        ordered_team_keys: order,
        affected_places: tie.affected_places,
        method: 'documented_arbiter_ruling',
        regulation_reference: group.adjudication_rules_reference ?? '',
        arbiter_decision_reference: decisionReference.trim(),
        explanation: explanation.trim(),
        next_allocation_version: data.review.proposed_new_version,
      });
      setReviewed(true);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'ranking_unavailable';
      setError(ERRORS[code] ?? 'Could not verify the ruling. No prize has been saved.');
    } finally {
      setChecking(false);
    }
  };

  const changed = (nextOrder: string[]) => {
    setOrder(nextOrder);
    setReviewed(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto print:hidden">
        <DialogHeader>
          <DialogTitle>Review official Team Prize tie — {group.name}</DialogTitle>
          <DialogDescription>
            Use only an actual decision made under the published tournament regulations.
            This review cannot change existing results or award money.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-warning/30 bg-warning/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Not saved.</strong> This is a read-only, server-validated ruling
            review. Final recording is unavailable until the protected release is approved.
          </AlertDescription>
        </Alert>

        {!tie ? (
          <Alert><AlertDescription>No genuine adjudicable team tie was found. Missing
            imported TB evidence must be corrected in the original results.</AlertDescription></Alert>
        ) : (
          <div className="space-y-4 py-2">
            {ties.length > 1 && (
              <div className="space-y-2">
                <Label>Choose the tied prize places</Label>
                <div className="flex flex-wrap gap-2">
                  {ties.map((item, index) => (
                    <Button key={item.affected_places.join('-')} type="button" size="sm"
                      variant={tieIndex === index ? 'default' : 'outline'}
                      onClick={() => chooseTie(index)}
                      aria-pressed={tieIndex === index}>
                      Places {item.affected_places.join(', ')}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Officially decided order</Label>
              <p className="text-xs text-muted-foreground">
                Only these genuinely tied teams can be reordered. The list is not an automatic winner selection.
              </p>
              <div className="space-y-2">
                {order.map((key, index) => (
                  <div key={key} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <span className="w-8 text-sm font-semibold text-muted-foreground">{index + 1}.</span>
                    <span className="flex-1 truncate text-sm font-medium">{key}</span>
                    <Button type="button" variant="outline" size="icon"
                      aria-label={`Move ${key} up`} disabled={checking || index === 0}
                      onClick={() => changed(move(order, index, index - 1))}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon"
                      aria-label={`Move ${key} down`} disabled={checking || index === order.length - 1}
                      onClick={() => changed(move(order, index, index + 1))}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Affected prize places: {tie.affected_places.join(', ')}. Other teams and prizes remain unchanged.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v2-regulations">Published team-prize regulations</Label>
              <Input id="v2-regulations" value={group.adjudication_rules_reference ?? ''}
                readOnly aria-readonly="true" className="bg-muted/40" />
              <p className="text-xs text-muted-foreground">
                Edit this reference in Team Prizes → Edit Rules if it is wrong.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v2-decision">Official arbiter decision reference *</Label>
              <Input id="v2-decision" maxLength={300} value={decisionReference}
                placeholder="e.g. Arbiter ruling #17, dated 27 Oct"
                onChange={event => { setDecisionReference(event.target.value); setReviewed(false); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v2-explanation">Explain the authorized ruling *</Label>
              <Textarea id="v2-explanation" value={explanation} maxLength={1600}
                placeholder="How did the published regulations authorize this result?"
                onChange={event => { setExplanation(event.target.value); setReviewed(false); }}
                rows={3} />
            </div>
          </div>
        )}

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {reviewed && (
          <Alert className="border-primary/30 bg-primary/5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription>
              The current server ranking agrees that this is a genuine tie and the
              proposed order matches the affected places. <strong>Nothing was saved.</strong>
              Official verification of the ruling document and the new-version database
              commit remain required.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={reviewRuling}
            disabled={!tie || checking || !decisionReference.trim() || !explanation.trim() ||
              !group.adjudication_rules_reference?.trim()}>
            {checking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check official ruling
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
