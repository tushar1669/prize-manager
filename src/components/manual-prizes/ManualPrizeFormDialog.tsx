import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ManualPrize } from "@/hooks/useManualPrizes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prize?: ManualPrize | null;
  onSubmit: (values: {
    title: string;
    winner_name: string;
    prize_value?: string | null;
    sponsor?: string | null;
    notes?: string | null;
    is_visible: boolean;
  }) => void;
  isPending?: boolean;
}

export function ManualPrizeFormDialog({ open, onOpenChange, prize, onSubmit, isPending }: Props) {
  const [title, setTitle] = useState("");
  const [winnerName, setWinnerName] = useState("");
  const [prizeValue, setPrizeValue] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [notes, setNotes] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (open) {
      setTitle(prize?.title ?? "");
      setWinnerName(prize?.winner_name ?? "");
      setPrizeValue(prize?.prize_value ?? "");
      setSponsor(prize?.sponsor ?? "");
      setNotes(prize?.notes ?? "");
      setIsVisible(prize?.is_visible ?? true);
    }
  }, [open, prize]);

  const isEdit = !!prize;
  const canSubmit = title.trim().length > 0 && winnerName.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      winner_name: winnerName.trim(),
      prize_value: prizeValue.trim() || null,
      sponsor: sponsor.trim() || null,
      notes: notes.trim() || null,
      is_visible: isVisible,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Prize" : "Add Manual Prize"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mp-title">Prize Title *</Label>
            <Input
              id="mp-title"
              placeholder="e.g. Best Fighting Spirit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mp-winner">Winner Name *</Label>
            <Input
              id="mp-winner"
              placeholder="e.g. Ravi Kumar"
              value={winnerName}
              onChange={(e) => setWinnerName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mp-value">Prize Value</Label>
              <Input
                id="mp-value"
                placeholder="e.g. ₹2000 / Trophy"
                value={prizeValue}
                onChange={(e) => setPrizeValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mp-sponsor">Sponsor</Label>
              <Input
                id="mp-sponsor"
                placeholder="Optional"
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mp-notes">Notes</Label>
            <Textarea
              id="mp-notes"
              placeholder="Any additional details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="mp-visible"
              checked={isVisible}
              onCheckedChange={setIsVisible}
            />
            <Label htmlFor="mp-visible" className="text-sm">
              Visible on public listing
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? "Saving…" : isEdit ? "Update" : "Add Prize"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
