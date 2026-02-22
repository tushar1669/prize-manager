import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Plus, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUpgradeUrl } from "@/utils/upgradeUrl";
import {
  useManualPrizes,
  useCreateManualPrize,
  useUpdateManualPrize,
  useDeleteManualPrize,
  useReorderManualPrizes,
  type ManualPrize,
} from "@/hooks/useManualPrizes";
import { ManualPrizeFormDialog } from "./ManualPrizeFormDialog";
import { SortableManualPrizeItem } from "./SortableManualPrizeItem";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

interface Props {
  tournamentId: string;
  hasFullAccess: boolean;
}

export function ManualPrizesCard({ tournamentId, hasFullAccess }: Props) {
  const navigate = useNavigate();
  const { data: prizes = [], isLoading } = useManualPrizes(tournamentId);
  const createMut = useCreateManualPrize(tournamentId);
  const updateMut = useUpdateManualPrize(tournamentId);
  const deleteMut = useDeleteManualPrize(tournamentId);
  const reorderMut = useReorderManualPrizes(tournamentId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<ManualPrize | null>(null);
  const [localOrder, setLocalOrder] = useState<ManualPrize[] | null>(null);

  // Use localOrder during drag, otherwise server data
  const displayPrizes = localOrder ?? prizes;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sortableIds = useMemo(() => displayPrizes.map((p) => p.id), [displayPrizes]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setLocalOrder(null);
        return;
      }

      const source = localOrder ?? prizes;
      const oldIdx = source.findIndex((p) => p.id === active.id);
      const newIdx = source.findIndex((p) => p.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;

      const reordered = arrayMove(source, oldIdx, newIdx);
      setLocalOrder(reordered);

      reorderMut.mutate(reordered.map((p) => p.id), {
        onSettled: () => setLocalOrder(null),
      });
    },
    [localOrder, prizes, reorderMut]
  );

  const handleOpenCreate = () => {
    setEditingPrize(null);
    setDialogOpen(true);
  };

  const handleEdit = useCallback((prize: ManualPrize) => {
    setEditingPrize(prize);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => deleteMut.mutate(id),
    [deleteMut]
  );

  const handleSubmit = useCallback(
    (values: {
      title: string;
      winner_name: string;
      prize_value?: string | null;
      sponsor?: string | null;
      notes?: string | null;
      is_visible: boolean;
    }) => {
      if (editingPrize) {
        updateMut.mutate(
          { id: editingPrize.id, ...values },
          { onSuccess: () => setDialogOpen(false) }
        );
      } else {
        // Set sort_order to end of list
        const maxSort = prizes.reduce((m, p) => Math.max(m, p.sort_order), 0);
        createMut.mutate(
          { ...values, sort_order: maxSort + 10 },
          { onSuccess: () => setDialogOpen(false) }
        );
      }
    },
    [editingPrize, updateMut, createMut, prizes]
  );

  const upgradeUrl = useMemo(
    () => getUpgradeUrl(tournamentId, `/t/${tournamentId}/finalize`),
    [tournamentId]
  );

  // --- Locked state (non-Pro) ---
  if (!hasFullAccess) {
    return (
      <Card className="print:hidden border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-5 w-5 text-muted-foreground" />
            Special / Manual Prizes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Record special awards like Best Fighting Spirit, Best Female Player, and more.
              Available with Pro access.
            </p>
            <Button onClick={() => navigate(upgradeUrl)}>Upgrade to Pro</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Full access ---
  return (
    <Card className="print:hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-5 w-5 text-primary" />
          Special / Manual Prizes
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Prize
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : displayPrizes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No manual prizes yet. Click "Add Prize" to record special awards.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {displayPrizes.map((prize) => (
                  <SortableManualPrizeItem
                    key={prize.id}
                    prize={prize}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <p className="text-xs text-muted-foreground pt-1">
          Visible on the public listing after publishing.
        </p>
      </CardContent>

      <ManualPrizeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        prize={editingPrize}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
      />
    </Card>
  );
}
