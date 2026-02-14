import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { RefreshCw } from "lucide-react";
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
import { DISCOUNT_TYPE_OPTIONS, getDiscountTypeLabel } from "@/lib/coupons/constants";
import type { Coupon, CouponFormData, DiscountType } from "./types";

interface CouponFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CouponFormData;
  setForm: React.Dispatch<React.SetStateAction<CouponFormData>>;
  editingCoupon: Coupon | null;
  onRegenerateCode: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function CouponFormDialog({
  open,
  onOpenChange,
  form,
  setForm,
  editingCoupon,
  onRegenerateCode,
  onSave,
  isSaving,
}: CouponFormDialogProps) {
  const hasDateRangeError =
    form.starts_at != null && form.ends_at != null && form.starts_at.getTime() > form.ends_at.getTime();

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
            <div className="flex items-center gap-2">
              <Input
                id="coupon-code"
                placeholder="WELCOME20"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                onBlur={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.trim().toUpperCase() }))
                }
                className="font-mono uppercase"
              />
              {!editingCoupon ? (
                <Button type="button" variant="outline" size="icon" onClick={onRegenerateCode} title="Regenerate code">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
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
                  setForm((f) => ({ ...f, discount_type: v as DiscountType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "percent"
                        ? `${getDiscountTypeLabel(option)} (%)`
                        : option === "amount"
                          ? `${getDiscountTypeLabel(option)} (₹ off)`
                          : `${getDiscountTypeLabel(option)} (final price)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-value">Value</Label>
              <Input
                id="discount-value"
                type="number"
                min="0"
                placeholder={form.discount_type === "percent" ? "20" : "500"}
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DateTimePicker
              label="Starts At"
              value={form.starts_at}
              onChange={(value) => setForm((f) => ({ ...f, starts_at: value }))}
            />
            <DateTimePicker
              label="Ends At"
              value={form.ends_at}
              onChange={(value) => setForm((f) => ({ ...f, ends_at: value }))}
            />
          </div>
          {hasDateRangeError ? (
            <p className="text-sm text-destructive">Ends At must be later than or equal to Starts At.</p>
          ) : null}

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
          <Button onClick={onSave} disabled={isSaving || hasDateRangeError}>
            {isSaving ? "Saving…" : editingCoupon ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
