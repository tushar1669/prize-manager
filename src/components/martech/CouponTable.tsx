import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Pencil, Ticket } from "lucide-react";
import { toast } from "sonner";
import type { Coupon, CouponRedemption } from "./types";
import { formatDiscount } from "./types";

interface CouponTableProps {
  coupons: Coupon[];
  redemptions: CouponRedemption[] | undefined;
  isLoading: boolean;
  onEdit: (coupon: Coupon) => void;
  onToggleActive: (id: string, is_active: boolean) => void;
  isToggling: boolean;
}

export function CouponTable({
  coupons,
  redemptions,
  isLoading,
  onEdit,
  onToggleActive,
  isToggling,
}: CouponTableProps) {
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Coupon code copied");
    } catch {
      toast.error("Failed to copy coupon code");
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!coupons || coupons.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Ticket className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>No coupons yet. Create one to get started.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead>Issued To</TableHead>
          <TableHead>Valid</TableHead>
          <TableHead>Limits</TableHead>
          <TableHead>Redemptions</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coupons.map((c) => {
          const couponRedemptions = redemptions?.filter((r) => r.coupon_id === c.id) ?? [];
          const redeemCount = couponRedemptions.length;
          const isExpired = c.ends_at ? new Date(c.ends_at) < new Date() : false;

          return (
            <TableRow key={c.id} className={isExpired ? "opacity-60" : ""}>
              <TableCell>
                <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{c.code}</code>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{formatDiscount(c.discount_type, c.discount_value)}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                {c.issued_to_email || "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "—"} →{" "}
                {c.ends_at ? (
                  <span className={isExpired ? "text-destructive font-medium" : ""}>
                    {new Date(c.ends_at).toLocaleDateString()}
                    {isExpired && " (expired)"}
                  </span>
                ) : (
                  "∞"
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {c.max_redemptions != null ? `${redeemCount}/${c.max_redemptions}` : "∞"}
                {c.max_redemptions_per_user != null && ` (${c.max_redemptions_per_user}/user)`}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{redeemCount}</Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={c.is_active}
                  onCheckedChange={(checked) => onToggleActive(c.id, checked)}
                  disabled={isToggling}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyCode(c.code)} title="Copy code">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(c)} title="Edit coupon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
