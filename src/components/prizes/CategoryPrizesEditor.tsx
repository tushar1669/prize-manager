import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Save, Trophy, Medal, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import ErrorPanel from '@/components/ui/ErrorPanel';
import { useErrorPanel } from '@/hooks/useErrorPanel';
import { toast } from 'sonner';

export interface PrizeRow {
  id?: string;
  place: number;
  cash_amount: number;
  has_trophy: boolean;
  has_medal: boolean;
  is_active: boolean;
  _tempId?: string;
  _status?: 'new' | 'dirty' | 'clean' | 'deleted';
}

export interface CategoryRow {
  id: string;
  name: string;
  is_main: boolean;
  is_active: boolean;
  order_idx: number;
  criteria_json?: any;
  prizes: PrizeRow[];
}

export interface PrizeDelta {
  inserts: Omit<PrizeRow, 'id' | '_tempId' | '_status'>[];
  updates: (Omit<PrizeRow, '_tempId' | '_status'> & { id: string })[];
  deletes: string[];
}

interface Props {
  category: CategoryRow;
  onSave: (categoryId: string, delta: PrizeDelta) => Promise<any>;
  onToggleCategory: (categoryId: string, isActive: boolean) => void;
  isOrganizer: boolean;
}

export default function CategoryPrizesEditor({ category, onSave, onToggleCategory, isOrganizer }: Props) {
  const [draft, setDraft] = useState<PrizeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<PrizeRow[]>([]);
  const { error, showError, clearError } = useErrorPanel();
  const newRowFocusRef = useRef<HTMLInputElement | null>(null);

  // initialize/refresh from props (also when prizes list changes on refetch)
  useEffect(() => {
    const base = (category.prizes || []).map(p => ({ ...p, _status: 'clean' as const }));
    // Compare by stable shape to avoid clobbering live edits unnecessarily
    const normalize = (rows: PrizeRow[]) =>
      JSON.stringify(rows.map(r => ({
        id: r.id,
        place: r.place,
        cash_amount: r.cash_amount,
        has_trophy: r.has_trophy,
        has_medal: r.has_medal,
        is_active: r.is_active,
      })));
    const incoming = normalize(base);
    const current  = normalize(lastSaved);
    // If server data changed (e.g., inserts now have IDs), adopt it
    if (incoming !== current) {
      setDraft(base);
      setLastSaved(base);
    }
  }, [category.id, category.prizes, lastSaved]);

  const visibleRows = useMemo(
    () => draft.filter(p => p._status !== 'deleted').sort((a, b) => (a.place || 0) - (b.place || 0)),
    [draft]
  );

  const nextPlace = useMemo(() => {
    const places = draft.filter(p => p._status !== 'deleted').map(p => Number(p.place) || 0);
    return (places.length ? Math.max(...places) : 0) + 1;
  }, [draft]);

  const handleAddRow = () => {
    const row: PrizeRow = {
      _tempId: crypto.randomUUID(),
      _status: 'new',
      place: nextPlace,
      cash_amount: 0,
      has_trophy: false,
      has_medal: false,
      is_active: true,
    };
    console.log('[prizes-cat] add', { categoryId: category.id, tempId: row._tempId });
    setDraft(prev => [...prev, row]);
    // focus the new place input on next tick
    setTimeout(() => newRowFocusRef.current?.focus(), 0);
  };

  const markDirty = (idx: number, patch: Partial<PrizeRow>) => {
    setDraft(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, _status: next[idx]._status === 'new' ? 'new' : 'dirty' };
      const idOrTemp = next[idx].id || next[idx]._tempId;
      const [field] = Object.keys(patch);
      const value = (patch as any)[field];
      console.log('[prizes-cat] edit', { categoryId: category.id, item: idOrTemp, field, value });
      return next;
    });
  };

  const handleRemove = (idx: number) => {
    setDraft(prev => {
      const next = [...prev];
      const row = next[idx];
      console.log('[prizes-cat] remove', { categoryId: category.id, item: row.id || row._tempId });
      if (row.id) {
        next[idx] = { ...row, _status: 'deleted' };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const handleTogglePrizeActive = (idx: number) => {
    setDraft(prev => {
      const next = [...prev];
      const row = next[idx];
      const newVal = !row.is_active;
      console.log('[prizes-cat] toggle prize', { categoryId: category.id, prizeId: row.id || row._tempId, is_active: newVal });
      next[idx] = { ...row, is_active: newVal, _status: row._status === 'new' ? 'new' : 'dirty' };
      return next;
    });
  };

  const validationError = (): string | null => {
    const places = draft
      .filter(p => p._status !== 'deleted')
      .map(p => Number(p.place));

    const seen = new Set<number>();
    const dup = new Set<number>();
    for (const n of places) {
      if (!Number.isInteger(n) || n < 1) {
        return `Invalid place: ${n}. Place must be a positive integer.`;
      }
      if (seen.has(n)) dup.add(n);
      seen.add(n);
    }
    if (dup.size) {
      return `Duplicate places: ${Array.from(dup).join(', ')}. Each place must be unique within the category.`;
    }
    return null;
  };

  const computeDelta = (): PrizeDelta => {
    const inserts = draft
      .filter(p => p._status === 'new' && !p.id)
      .map(p => ({
        place: Number(p.place) || 0,
        cash_amount: Number(p.cash_amount) || 0,
        has_trophy: !!p.has_trophy,
        has_medal: !!p.has_medal,
        is_active: !!p.is_active,
      }));

    const updates = draft
      .filter(p => p._status === 'dirty' && !!p.id)
      .map(p => ({
        id: p.id!,
        place: Number(p.place) || 0,
        cash_amount: Number(p.cash_amount) || 0,
        has_trophy: !!p.has_trophy,
        has_medal: !!p.has_medal,
        is_active: !!p.is_active,
      }));

    const deletes = draft.filter(p => p._status === 'deleted' && !!p.id).map(p => p.id!) || [];

    return { inserts, updates, deletes };
  };

  const handleSave = async () => {
    clearError();
    const v = validationError();
    if (v) {
      showError({ title: 'Validation Error', message: v, hint: 'Fix duplicate/invalid place numbers before saving.' });
      toast.error(v);
      return;
    }

    const delta = computeDelta();
    console.log('[prizes-cat] save category', {
      categoryId: category.id, inserts: delta.inserts.length, updates: delta.updates.length, deletes: delta.deletes.length
    });

    try {
      setSaving(true);
      await onSave(category.id, delta);
      // reset statuses to clean & update baseline
      const cleaned = draft
        .filter(p => p._status !== 'deleted')
        .map(p => ({ ...p, _status: 'clean' as const }));
      setDraft(cleaned);
      setLastSaved(cleaned);
      toast.success('Category prizes saved');
    } catch (e: any) {
      console.error('[prizes-cat] error', { scope: 'category', message: e?.message || String(e) });
      setDraft(lastSaved); // rollback
      showError({
        title: 'Failed to save prizes',
        message: e?.message || 'Unknown error',
        hint: 'Ensure each place is unique within the category.',
      });
      toast.error(e?.message || 'Failed to save prizes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={category.is_active}
            onCheckedChange={(val: boolean) => onToggleCategory(category.id, !!val)}
            aria-label={`Include ${category.name}`}
          />
          <CardTitle className="text-lg">{category.name}</CardTitle>
          {category.is_main && (
            <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">Main</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ErrorPanel error={error} onDismiss={() => clearError()} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-2 pr-4 w-20">Place</th>
                <th className="text-left py-2 pr-4 w-40">Cash (₹)</th>
                <th className="text-left py-2 pr-4 w-24">Trophy</th>
                <th className="text-left py-2 pr-4 w-24">Medal</th>
                <th className="text-left py-2 pr-4 w-24">Active</th>
                <th className="text-right py-2 pl-4 w-16"> </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => {
                const rowIndex = draft.findIndex(p => (p.id || p._tempId) === (row.id || row._tempId));
                const onFirst = idx === visibleRows.length - 1 && row._status === 'new';
                return (
                  <tr key={row.id || row._tempId} className={cn('border-t')}>
                    <td className="py-2 pr-4">
                      <Input
                        ref={onFirst ? newRowFocusRef : undefined}
                        type="number"
                        min={1}
                        value={row.place ?? ''}
                        onChange={(e) => markDirty(rowIndex, { place: parseInt(e.target.value || '1', 10) })}
                        className="w-20"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <Input
                        type="number"
                        min={0}
                        value={row.cash_amount ?? 0}
                        onChange={(e) => markDirty(rowIndex, { cash_amount: parseInt(e.target.value || '0', 10) })}
                        className="w-40"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!row.has_trophy}
                          onCheckedChange={(val) => markDirty(rowIndex, { has_trophy: !!val })}
                          aria-label="Has trophy"
                        />
                        <Trophy className="h-4 w-4 opacity-70" />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!row.has_medal}
                          onCheckedChange={(val) => markDirty(rowIndex, { has_medal: !!val })}
                          aria-label="Has medal"
                        />
                        <Medal className="h-4 w-4 opacity-70" />
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <Checkbox
                        checked={!!row.is_active}
                        onCheckedChange={() => handleTogglePrizeActive(rowIndex)}
                        aria-label="Prize active"
                      />
                    </td>
                    <td className="py-2 pl-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove prize ${row.place}`}
                        onClick={() => handleRemove(rowIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="secondary" onClick={handleAddRow}>
            <Plus className="h-4 w-4 mr-2" />
            Add prize row
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <svg className="h-4 w-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" opacity="0.75"/>
                </svg>
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Category Prizes
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
