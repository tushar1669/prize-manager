import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, Save, Trophy, Medal, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { InstitutionPrize, InstitutionPrizeDelta } from './types';

interface Props {
  groupId: string;
  prizes: InstitutionPrize[];
  onSave: (groupId: string, delta: InstitutionPrizeDelta) => Promise<void>;
}

export default function TeamGroupPrizesTable({ groupId, prizes: initialPrizes, onSave }: Props) {
  const [draft, setDraft] = useState<InstitutionPrize[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize from props
  useEffect(() => {
    const base = initialPrizes.map(p => ({ ...p, _status: 'clean' as const }));
    setDraft(base);
  }, [initialPrizes]);

  const visibleRows = useMemo(
    () => draft.filter(p => p._status !== 'deleted').sort((a, b) => a.place - b.place),
    [draft]
  );

  const hasDirty = useMemo(
    () => draft.some(p => p._status === 'new' || p._status === 'dirty' || p._status === 'deleted'),
    [draft]
  );

  const nextPlace = useMemo(() => {
    const places = draft.filter(p => p._status !== 'deleted').map(p => p.place || 0);
    return (places.length ? Math.max(...places) : 0) + 1;
  }, [draft]);

  const handleAddRow = () => {
    const row: InstitutionPrize = {
      _tempId: crypto.randomUUID(),
      _status: 'new',
      group_id: groupId,
      place: nextPlace,
      cash_amount: 0,
      has_trophy: false,
      has_medal: false,
      is_active: true,
    };
    setDraft(prev => [...prev, row]);
  };

  const handleDuplicateRow = (sourceRow: InstitutionPrize) => {
    const newRow: InstitutionPrize = {
      _tempId: crypto.randomUUID(),
      _status: 'new',
      group_id: groupId,
      place: nextPlace,
      cash_amount: sourceRow.cash_amount,
      has_trophy: sourceRow.has_trophy,
      has_medal: sourceRow.has_medal,
      is_active: true,
    };
    setDraft(prev => [...prev, newRow]);
  };

  const markDirty = (idx: number, patch: Partial<InstitutionPrize>) => {
    setDraft(prev => {
      const next = [...prev];
      next[idx] = { 
        ...next[idx], 
        ...patch, 
        _status: next[idx]._status === 'new' ? 'new' : 'dirty',
        _error: undefined,
      };
      return next;
    });
  };

  const handleRemove = (idx: number) => {
    setDraft(prev => {
      const next = [...prev];
      const row = next[idx];
      if (row.id) {
        next[idx] = { ...row, _status: 'deleted' };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const validate = useCallback((): string | null => {
    const activeRows = draft.filter(p => p._status !== 'deleted');
    const placeSet = new Set<number>();
    
    for (const row of activeRows) {
      if (!Number.isInteger(row.place) || row.place < 1) {
        return `Invalid place: ${row.place}. Place must be a positive integer.`;
      }
      if (placeSet.has(row.place)) {
        return `Duplicate place: ${row.place}. Each place must be unique within the group.`;
      }
      placeSet.add(row.place);
      
      // Check for empty prizes
      if (row.cash_amount === 0 && !row.has_trophy && !row.has_medal) {
        return `Empty prize at place ${row.place}: Add cash, trophy, or medal.`;
      }
    }
    
    return null;
  }, [draft]);

  const computeDelta = useCallback((): InstitutionPrizeDelta => {
    const inserts: InstitutionPrizeDelta['inserts'] = [];
    const updates: InstitutionPrizeDelta['updates'] = [];
    const deletes: string[] = [];

    for (const p of draft) {
      if (p._status === 'deleted' && p.id) {
        deletes.push(p.id);
      } else if (p._status === 'new') {
        inserts.push({
          group_id: groupId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active,
        });
      } else if (p._status === 'dirty' && p.id) {
        updates.push({
          id: p.id,
          group_id: groupId,
          place: p.place,
          cash_amount: p.cash_amount,
          has_trophy: p.has_trophy,
          has_medal: p.has_medal,
          is_active: p.is_active,
        });
      }
    }

    return { inserts, updates, deletes };
  }, [draft, groupId]);

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    const delta = computeDelta();
    if (!delta.inserts.length && !delta.updates.length && !delta.deletes.length) {
      toast.info('No changes to save');
      return;
    }

    try {
      setSaving(true);
      await onSave(groupId, delta);
      // Reset statuses
      setDraft(prev => 
        prev
          .filter(p => p._status !== 'deleted')
          .map(p => ({ ...p, _status: 'clean' as const }))
      );
      toast.success('Prizes saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save prizes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleAddRow}>
          <Plus className="h-4 w-4 mr-1" />
          Add Prize
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !hasDirty}>
          {saving ? (
            <>
              <svg className="h-4 w-4 mr-1 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" opacity="0.75"/>
              </svg>
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-1" />
              Save Prizes
            </>
          )}
        </Button>
        {hasDirty && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-20">Place</TableHead>
            <TableHead>Cash (₹)</TableHead>
            <TableHead className="w-20">
              <Trophy className="h-4 w-4 inline" />
            </TableHead>
            <TableHead className="w-20">
              <Medal className="h-4 w-4 inline" />
            </TableHead>
            <TableHead className="w-20">Active</TableHead>
            <TableHead className="w-24"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                No prizes defined. Click "Add Prize" to start.
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row, idx) => {
              const realIdx = draft.findIndex(p => (p.id || p._tempId) === (row.id || row._tempId));
              const isEmpty = row.cash_amount === 0 && !row.has_trophy && !row.has_medal;
              
              return (
                <TableRow 
                  key={row.id || row._tempId} 
                  className={cn(
                    isEmpty && 'bg-amber-50 dark:bg-amber-950/30',
                    row._status === 'new' && 'bg-green-50/50 dark:bg-green-950/20',
                    row._status === 'dirty' && 'bg-blue-50/50 dark:bg-blue-950/20'
                  )}
                >
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={row.place}
                      onChange={(e) => markDirty(realIdx, { place: parseInt(e.target.value) || 1 })}
                      className="w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      value={row.cash_amount}
                      onChange={(e) => markDirty(realIdx, { cash_amount: parseInt(e.target.value) || 0 })}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.has_trophy}
                      onCheckedChange={(checked) => markDirty(realIdx, { has_trophy: !!checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.has_medal}
                      onCheckedChange={(checked) => markDirty(realIdx, { has_medal: !!checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.is_active}
                      onCheckedChange={(checked) => markDirty(realIdx, { is_active: !!checked })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDuplicateRow(row)}
                        title="Duplicate row"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleRemove(realIdx)}
                        className="text-destructive hover:text-destructive"
                        title="Delete row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      
      {visibleRows.some(r => r.cash_amount === 0 && !r.has_trophy && !r.has_medal) && (
        <p className="text-xs text-amber-600">
          Some prizes have no value. Add cash, trophy, or medal before saving.
        </p>
      )}
    </div>
  );
}
