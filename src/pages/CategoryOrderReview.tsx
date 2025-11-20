import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { AppNav } from '@/components/AppNav';
import { TournamentProgressBreadcrumbs } from '@/components/TournamentProgressBreadcrumbs';
import { Trophy, Medal, GripVertical, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { 
  DndContext, 
  closestCenter, 
  PointerSensor, 
  KeyboardSensor, 
  useSensor, 
  useSensors,
  DragEndEvent 
} from '@dnd-kit/core';
import { 
  SortableContext, 
  useSortable, 
  arrayMove, 
  verticalListSortingStrategy, 
  sortableKeyboardCoordinates 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ErrorPanel from '@/components/ui/ErrorPanel';
import { useErrorPanel } from '@/hooks/useErrorPanel';
import { useDirty } from '@/contexts/DirtyContext';
import { makeKey, getDraft, clearDraft, formatAge } from '@/utils/autosave';
import { useAutosaveEffect } from '@/hooks/useAutosaveEffect';

type Prize = { 
  id: string; 
  place: number; 
  cash_amount: number | null; 
  has_trophy: boolean; 
  has_medal: boolean; 
  is_active?: boolean 
};

type Category = { 
  id: string; 
  name: string; 
  is_main: boolean; 
  order_idx: number; 
  is_active?: boolean; 
  prizes: Prize[] 
};

export default function CategoryOrderReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [lastSavedOrder, setLastSavedOrder] = useState<Category[]>([]);
  const { error, showError, clearError } = useErrorPanel();
  const { setDirty, resetDirty, registerOnSave } = useDirty();

  // Autosave state
  const orderDraftKey = makeKey(`t:${id}:order-review`);
  const [orderRestore, setOrderRestore] = useState<null | { data: { ids: string[]; active: Record<string, boolean> }; ageMs: number }>(null);

  // DnD sensors (mouse/touch + keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    console.log('[order-review] mount', { id });
    (async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,is_main,order_idx,is_active,prizes(id,place,cash_amount,has_trophy,has_medal,is_active)')
        .eq('tournament_id', id)
        .order('order_idx', { ascending: true });
      
      if (error) { 
        toast.error(error.message); 
        setLoading(false); 
        return; 
      }
      
      const mapped = (data || []).map((c: any) => ({
        ...c,
        is_active: c.is_active ?? true,
        prizes: (c.prizes || []).map((p: any) => ({ ...p, is_active: p.is_active ?? true })),
      }));
      console.log('[order-review] loaded', mapped.map(c => ({ id: c.id, name: c.name, order_idx: c.order_idx, is_active: c.is_active, prizes: (c.prizes||[]).length })));
      setCats(mapped);
      setLastSavedOrder(mapped); // baseline for rollback on save error
      setLoading(false);
    })();
  }, [id]);

  // Delete category state and mutation
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; category: Category | null }>({ 
    open: false, 
    category: null 
  });
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: async (_, deletedId) => {
      // Re-fetch categories
      const { data: freshCats, error: fetchErr } = await supabase
        .from('categories')
        .select('*, prizes(*)')
        .eq('tournament_id', id)
        .order('order_idx');
      
      if (fetchErr) {
        console.error('[delete-cat] refetch err', fetchErr);
        showError({ title: 'Refresh Error', message: 'Failed to refresh categories after delete' });
        return;
      }

      // Compact order_idx (0..N-1)
      const updatePromises = (freshCats || []).map((c, idx) => 
        supabase
          .from('categories')
          .update({ order_idx: idx })
          .eq('id', c.id)
      );

      if (updatePromises.length > 0) {
        const results = await Promise.all(updatePromises);
        const updateErr = results.find(r => r.error)?.error;
        
        if (updateErr) {
          console.error('[delete-cat] reindex err', updateErr);
          showError({ title: 'Reindex Error', message: 'Failed to reindex categories' });
          return;
        }
      }

      // Update local state
      setCats((freshCats || []).map((c, idx) => ({ ...c, order_idx: idx, prizes: c.prizes || [] })));
      resetDirty('order-review');
      toast.success('Category deleted successfully');
      setDeleteDialog({ open: false, category: null });
      setDeleteConfirmText('');
    },
    onError: (err: any) => {
      console.error('[delete-cat] err', err);
      showError({ title: 'Delete Error', message: `Failed to delete category: ${err.message || 'Unknown error'}` });
    },
  });

  // Check for draft when cats load
  useEffect(() => {
    const saved = getDraft<{ ids: string[]; active: Record<string, boolean> }>(orderDraftKey, 1);
    if (saved) setOrderRestore(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Track dirty state (by *array order* + active flags), not order_idx (which changes only after save)
  useEffect(() => {
    const currentOrder = cats.map(c => c.id).join(',');
    const savedOrder = lastSavedOrder.map(c => c.id).join(',');
    if (currentOrder !== savedOrder) {
      setDirty('order-review', true);
      return;
    }
    // compare is_active on categories and their prizes
    const byId = new Map(lastSavedOrder.map(c => [c.id, c]));
    let changed = false;
    for (const c of cats) {
      const s = byId.get(c.id);
      if (!s || (!!c.is_active !== !!s.is_active)) { changed = true; break; }
      const savedPrizeActive = new Map((s.prizes || []).map(p => [p.id, !!p.is_active]));
      for (const p of (c.prizes || [])) {
        if (savedPrizeActive.get(p.id) !== !!p.is_active) { changed = true; break; }
      }
      if (changed) break;
    }
    setDirty('order-review', changed);
  }, [cats, lastSavedOrder, setDirty]);

  // Derive minimal shape and dirty state for autosave
  const minimal = {
    ids: cats.map(c => c.id),
    active: Object.fromEntries(cats.map(c => [c.id, !!c.is_active])),
  };

  const isDirty =
    JSON.stringify(minimal.ids) !== JSON.stringify(lastSavedOrder.map(c => c.id)) ||
    cats.some(c => {
      const saved = lastSavedOrder.find(s => s.id === c.id);
      return saved ? !!c.is_active !== !!saved.is_active : true;
    });

  // Autosave when dirty
  useAutosaveEffect({
    key: orderDraftKey,
    data: minimal,
    enabled: isDirty,
    debounceMs: 900,
    version: 1,
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCats((prev: Category[]) => {
      const oldIdx = prev.findIndex((c: Category) => c.id === active.id);
      const newIdx = prev.findIndex((c: Category) => c.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;

      const reordered = arrayMove(prev, oldIdx, newIdx);
      console.log('[order-review] dnd end', reordered.map((c: Category, i: number) => ({ id: c.id, name: c.name, order: i })));
      return reordered;
    });
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
      
      // Build bulk updates
      const catUpdates = cats.map((c, i) => ({ 
        id: c.id, 
        order_idx: i, 
        is_active: c.is_active ?? true 
      }));
      const prizeUpdates = cats.flatMap(c => 
        (c.prizes || []).map(p => ({ 
          id: p.id, 
          is_active: p.is_active ?? true 
        }))
      );
      
      console.log('[order-review] saving', { 
        categories: catUpdates, 
        prizes: prizeUpdates.length 
      });
      
      // Bulk update categories using Promise.all for performance
      await Promise.all(
        catUpdates.map(c => 
          supabase
            .from('categories')
            .update({ order_idx: c.order_idx, is_active: c.is_active })
            .eq('id', c.id)
        )
      );
      
      // Bulk update prizes if any
      if (prizeUpdates.length > 0) {
        await Promise.all(
          prizeUpdates.map(p => 
            supabase
              .from('prizes')
              .update({ is_active: p.is_active })
              .eq('id', p.id)
          )
        );
      }
      
      setLastSavedOrder(cats); // update baseline after successful save
      resetDirty('order-review');
      clearDraft(orderDraftKey);
      clearError();
      toast.success('Order & selections saved');
      navigate(`/t/${id}/import`);
    } catch (err: any) {
      console.error('[order-review] save error', err);
      setCats(lastSavedOrder); // rollback visual order
      showError({
        title: 'Failed to save order',
        message: err?.message || 'Unknown error',
        hint: 'Your changes have been reverted. Please try again.',
      });
      toast.error(err?.message || 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  // Register save handler for global shortcut (after handleConfirm is defined)
  useEffect(() => {
    if (!isDirty) {
      registerOnSave(null);
      return;
    }
    
    const saveHandler = async () => {
      console.log('[shortcut] saving order review');
      await handleConfirm();
    };
    registerOnSave(saveHandler);
    
    return () => registerOnSave(null);
  }, [isDirty, handleConfirm, registerOnSave]);

  // Sortable category item component
  function SortableCategoryItem({
    cat,
    onToggleCat,
    onTogglePrize,
    onDeleteCategory,
  }: {
    cat: Category;
    onToggleCat: (id: string) => void;
    onTogglePrize: (cid: string, pid: string) => void;
    onDeleteCategory?: (cat: Category) => void;
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : undefined,
    } as React.CSSProperties;

    return (
      <Card ref={setNodeRef} style={style} className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {/* Drag handle (keyboard accessible) */}
            <button
              type="button"
              className="p-2 rounded hover:bg-muted/60 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Drag to reorder"
              title="Drag to reorder. Press space or enter to pick up, arrow keys to move, enter to drop."
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </button>

            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={!!cat.is_active}
                  onCheckedChange={() => onToggleCat(cat.id)}
                  aria-label={`Include ${cat.name}`}
                />
                <span className="font-semibold text-lg">{cat.name}</span>
                {cat.is_main && (
                  <span className="px-2 py-1 text-xs rounded-md bg-primary/10 text-primary border border-primary/30">
                    Main
                  </span>
                )}
                {!cat.is_main && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCategory?.(cat);
                    }}
                    title="Delete category"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid gap-2 pl-8">
                {(cat.prizes || []).sort((a, b) => a.place - b.place).map(p => (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={!!p.is_active}
                      onCheckedChange={() => onTogglePrize(cat.id, p.id)}
                      aria-label={`Include prize place #${p.place}`}
                    />
                    <span className="w-20 font-medium">Place #{p.place}</span>
                    <span className="w-28 font-mono">₹{p.cash_amount ?? 0}</span>
                    <div className="flex gap-1 text-muted-foreground">
                      {p.has_trophy && <Trophy className="h-4 w-4" />}
                      {p.has_medal && <Medal className="h-4 w-4" />}
                    </div>
                  </div>
                ))}
                {(!cat.prizes || cat.prizes.length === 0) && (
                  <div className="text-sm text-muted-foreground">No prizes in this category.</div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="p-6">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container max-w-5xl mx-auto p-6 space-y-6">
        <TournamentProgressBreadcrumbs />
        
        <div>
          <h1 className="text-3xl font-bold">Review Category Order</h1>
          <p className="text-muted-foreground mt-2">
            Reorder categories and choose which categories/prizes are included in allocation.
            This order becomes brochure priority for prize allocation.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            💡 Drag rows to set brochure order. This order becomes the source of truth for allocation priority.
          </p>
        </div>

        <ErrorPanel error={error} onDismiss={clearError} />

        {orderRestore && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>Saved order draft from <strong>{formatAge(orderRestore.ageMs)}</strong> is available.</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const byId = new Map(cats.map(c => [c.id, c]));
                    const restored = (orderRestore.data.ids || []).map(id => byId.get(id)).filter(Boolean);
                    const merged = restored.map((c: any) => ({ ...c, is_active: !!orderRestore.data.active[c.id] }));
                    setCats(merged as any);
                    setOrderRestore(null);
                  }}
                >
                  Restore draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearDraft(orderDraftKey);
                    setOrderRestore(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cats.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {cats.map((c: Category) => (
                <SortableCategoryItem
                  key={c.id}
                  cat={c}
                  onToggleCat={(cid) => {
                    console.log('[order-review] toggle category', { categoryId: cid });
                    setCats(prev => prev.map(x => x.id === cid ? { ...x, is_active: !x.is_active } : x));
                  }}
                  onTogglePrize={(cid, pid) => {
                    console.log('[order-review] toggle prize', { categoryId: cid, prizeId: pid });
                    setCats(prev => prev.map(x =>
                      x.id === cid
                        ? { ...x, prizes: (x.prizes || []).map((p: Prize) => p.id === pid ? { ...p, is_active: !p.is_active } : p) }
                        : x
                    ));
                  }}
                  onDeleteCategory={(cat) => setDeleteDialog({ open: true, category: cat })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-between pt-4">
          <Button 
            type="button"
            variant="outline" 
            onClick={() => {
              console.log('[order-review] cancel click');
              navigate(`/t/${id}/setup?tab=prizes`);
            }}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm & Continue'}
          </Button>
        </div>

        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog({ open: false, category: null });
            setDeleteConfirmText('');
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category: {deleteDialog.category?.name}</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the category and <strong>{deleteDialog.category?.prizes?.length || 0} prize(s)</strong> associated with it. 
                This action cannot be undone.
                <br /><br />
                Type <strong>{deleteDialog.category?.name}</strong> to confirm:
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type category name to confirm"
              className="mt-2"
            />
            <AlertDialogFooter>
              <AlertDialogCancel 
                type="button"
                onClick={() => {
                  setDeleteDialog({ open: false, category: null });
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                disabled={deleteConfirmText !== deleteDialog.category?.name || deleteCategoryMutation.isPending}
                onClick={() => {
                  if (deleteDialog.category?.id) {
                    deleteCategoryMutation.mutate(deleteDialog.category.id);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteCategoryMutation.isPending ? 'Deleting...' : 'Delete Category'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
