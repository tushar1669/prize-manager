import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManualPrize } from "@/hooks/useManualPrizes";

interface Props {
  prize: ManualPrize;
  onEdit: (prize: ManualPrize) => void;
  onDelete: (id: string) => void;
}

export const SortableManualPrizeItem = memo(function SortableManualPrizeItem({
  prize,
  onEdit,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prize.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : undefined,
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 ${
        isDragging ? "shadow-lg ring-2 ring-primary" : ""
      }`}
    >
      <button
        type="button"
        className="p-1 rounded hover:bg-muted/60 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{prize.title}</span>
          {!prize.is_visible && (
            <span title="Hidden from public"><EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" /></span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {prize.winner_name}
          {prize.prize_value && <span className="ml-1.5">· {prize.prize_value}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(prize)}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(prize.id)}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
