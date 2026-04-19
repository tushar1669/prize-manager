import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Loader2, AlertTriangle } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { WinnerInstitution, GroupResponse, PrizeWithWinner } from '@/components/team-prizes/useTeamPrizeResults';
import type { TieInfo } from '@/utils/teamTieDetection';

interface TeamTieBreakDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  version: number;
  group: GroupResponse;
  tieInfo: TieInfo;
  onResolved: () => void;
}

export function TeamTieBreakDialog({
  open,
  onOpenChange,
  tournamentId,
  version,
  group,
  tieInfo,
  onResolved,
}: TeamTieBreakDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<WinnerInstitution[]>(tieInfo.tiedInstitutions);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens with new data
  React.useEffect(() => {
    if (open) {
      setOrder(tieInfo.tiedInstitutions);
      setReason('');
      setError(null);
    }
  }, [open, tieInfo.tiedInstitutions]);

  const originalKeys = useMemo(
    () => tieInfo.tiedInstitutions.map((i) => i.key),
    [tieInfo.tiedInstitutions]
  );

  const orderChanged = useMemo(() => {
    const currentKeys = order.map((i) => i.key);
    return currentKeys.some((k, idx) => k !== originalKeys[idx]);
  }, [order, originalKeys]);

  const reasonRequired = orderChanged;
  const reasonValid = !reasonRequired || reason.trim().length > 0;

  const moveUp = useCallback((idx: number) => {
    if (idx <= 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (!reasonValid) return;
    setSaving(true);
    setError(null);

    const finalReason = reason.trim() || 'Confirmed default ordering';

    try {
      const affectedPlaces = tieInfo.affectedPlaces;

      if (affectedPlaces.length > 0) {
        const prizeByPlace = new Map<number, PrizeWithWinner>();
        for (const p of group.prizes) {
          if (affectedPlaces.includes(p.place)) {
            prizeByPlace.set(p.place, p);
          }
        }

        const winnersFromOrder = order.slice(0, affectedPlaces.length);

        const rowsPayload = winnersFromOrder.map((inst, idx) => {
          const place = affectedPlaces[idx];
          const prize = prizeByPlace.get(place);
          if (!prize) throw new Error(`No prize found for place ${place}`);
          return {
            prize_id: prize.id,
            place,
            institution_key: inst.key,
            total_points: inst.total_points,
            player_ids: inst.players.map((p) => p.player_id),
            player_snapshot: inst.players as unknown as Json,
          };
        });

        const { error: rpcError } = await supabase.rpc('resolve_team_tie', {
          p_tournament_id: tournamentId,
          p_version: version,
          p_group_id: tieInfo.groupId,
          p_affected_places: affectedPlaces,
          p_rows: rowsPayload as unknown as Json,
          p_note: finalReason,
        });

        if (rpcError) throw new Error(rpcError.message);
      } else {
        // No affected places — just save the note directly
        const { error: noteError } = await supabase
          .from('team_allocation_notes')
          .upsert(
            {
              tournament_id: tournamentId,
              version,
              group_id: tieInfo.groupId,
              note: finalReason,
              created_by: user?.id ?? null,
            },
            { onConflict: 'tournament_id,version,group_id' }
          );

        if (noteError) throw new Error(`Note save failed: ${noteError.message}`);
      }

      // Invalidate cache and refetch
      await queryClient.invalidateQueries({ queryKey: ['team-prize-results', tournamentId] });

      toast.success('Tie resolution saved');
      onResolved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast.error(`Failed to save: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Team Prize Tie — {group.name}</DialogTitle>
          <DialogDescription>
            {tieInfo.tiedInstitutions.length} teams have identical scores at the prize boundary.
            Confirm or reorder them below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {order.map((inst, idx) => {
            const hasPrize = idx < tieInfo.affectedPlaces.length;
            return (
              <div
                key={inst.key}
                className={`flex items-center gap-3 rounded-lg border p-3 ${
                  hasPrize ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-muted'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === 0}
                    onClick={() => moveUp(idx)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === order.length - 1}
                    onClick={() => moveDown(idx)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{inst.label || inst.key}</span>
                    {hasPrize ? (
                      <Badge variant="default" className="text-xs">Place {tieInfo.affectedPlaces[idx]}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Runner-up</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pts: {inst.total_points} · Rank Sum: {inst.rank_sum} · Best: #{inst.best_individual_rank}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {inst.players.map((p) => p.name).join(', ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {orderChanged && (
          <Alert className="border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive text-sm">
              Order changed from computed result. A reason is required.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Reason for ordering{reasonRequired ? ' *' : ' (optional)'}
          </label>
          <Textarea
            placeholder={
              reasonRequired
                ? 'Explain why you changed the order…'
                : 'Optional: add a note (auto-fills "Confirmed default ordering" if empty)'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !reasonValid}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Resolution'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
