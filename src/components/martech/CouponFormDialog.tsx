import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Coupon, CouponFormData } from "./types";

interface CouponFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CouponFormData;
  setForm: React.Dispatch<React.SetStateAction<CouponFormData>>;
  editingCoupon: Coupon | null;
  onSave: () => void;
  isSaving: boolean;
}

export function CouponFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editingCoupon,
  onSave,
  isSaving,
}: CouponFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingCoupon ? "Edit Coupon" : "New Coupon"}</DialogTitle>
          <DialogDescription>
            {editingCoupon ? "Update coupon details." : "Create a new discount coupon."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Code</Label>
            <Input
              id="coupon-code"
              placeholder="WELCOME20"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issued-to-email">Issued To (email, optional)</Label>
            <Input
              id="issued-to-email"
              type="email"
              placeholder="organizer@example.com"
              value={form.issued_to_email}
              onChange={(e) => setForm((f) => ({ ...f, issued_to_email: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Track who the coupon was intended for. The code itself can still be shared.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Discount Type</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, discount_type: v as "percentage" | "fixed" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-value">Value</Label>
              <Input
                id="discount-value"
                type="number"
                min="0"
                placeholder={form.discount_type === "percentage" ? "20" : "500"}
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="starts-at">Starts At</Label>
              <Input
                id="starts-at"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends-at">Ends At</Label>
              <Input
                id="ends-at"
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-redemptions">Max Redemptions</Label>
              <Input
                id="max-redemptions"
                type="number"
                min="0"
                placeholder="Unlimited"
                value={form.max_redemptions}
                onChange={(e) => setForm((f) => ({ ...f, max_redemptions: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-per-user">Max Per User</Label>
              <Input
                id="max-per-user"
                type="number"
                min="0"
                placeholder="1"
                value={form.max_redemptions_per_user}
                onChange={(e) =>
                  setForm((f) => ({ ...f, max_redemptions_per_user: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
            />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving…" : editingCoupon ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
