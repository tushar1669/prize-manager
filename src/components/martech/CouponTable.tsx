import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Copy, Eye, Pencil, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Coupon, CouponRedemption } from "./types";
import { formatDiscount } from "./types";

function originLabel(origin: string | null | undefined): { label: string; variant: "default" | "secondary" | "outline" } {
  switch (origin) {
    case "profile_reward": return { label: "Profile Reward", variant: "secondary" };
    case "referral_l1": return { label: "Referral L1", variant: "default" };
    case "referral_l2": return { label: "Referral L2", variant: "default" };
    case "referral_l3": return { label: "Referral L3", variant: "default" };
    case "admin": return { label: "Admin", variant: "outline" };
    default: return { label: origin || "Admin", variant: "outline" };
  }
}

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
  const [drilldownCoupon, setDrilldownCoupon] = useState<Coupon | null>(null);
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Coupon code copied");
    } catch {
      toast.error("Failed to copy coupon code");
    }
  };

  // Drilldown: fetch referral_rewards when a referral coupon is selected
  const drilldownOrigin = drilldownCoupon?.applies_to ? (drilldownCoupon as Coupon & { origin?: string }).origin : undefined;
  const isReferralOrigin = typeof drilldownOrigin === "string" && drilldownOrigin.startsWith("referral_");

  const { data: drilldownRewards } = useQuery({
    queryKey: ["coupon-drilldown-rewards", drilldownCoupon?.id],
    enabled: !!drilldownCoupon?.id && isReferralOrigin,
    queryFn: async () => {
      const unsafeSb = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, val: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
          };
        };
      };
      const { data, error } = await unsafeSb
        .from("referral_rewards")
        .select("id,level,beneficiary_id,trigger_user_id,trigger_tournament_id,created_at")
        .eq("coupon_id", drilldownCoupon!.id);
      if (error) return [];
      return (data ?? []) as Array<{
        id: string; level: number; beneficiary_id: string;
        trigger_user_id: string; trigger_tournament_id: string; created_at: string;
      }>;
    },
  });



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

  const couponWithOrigin = (c: Coupon) => (c as Coupon & { origin?: string | null }).origin ?? null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Source</TableHead>
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
            const ol = originLabel(couponWithOrigin(c));

            return (
              <TableRow key={c.id} className={isExpired ? "opacity-60" : ""}>
                <TableCell>
                  <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{c.code}</code>
                </TableCell>
                <TableCell>
                  <Badge variant={ol.variant}>{ol.label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{formatDiscount(c.discount_type, c.discount_value)}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                  {c.issued_to_email || (c.issued_to_user_id ? `User …${c.issued_to_user_id.slice(-6)}` : "—")}
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
                    <Button variant="ghost" size="sm" onClick={() => setDrilldownCoupon(c)} title="View details">
                      <Eye className="h-4 w-4" />
                    </Button>
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

      {/* Drilldown Sheet */}
      <Sheet open={!!drilldownCoupon} onOpenChange={(open) => { if (!open) setDrilldownCoupon(null); }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {drilldownCoupon && (
            <>
              <SheetHeader>
                <SheetTitle>Coupon Details</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-lg bg-muted px-3 py-1 rounded font-bold">{drilldownCoupon.code}</code>
                    <Badge variant={originLabel(couponWithOrigin(drilldownCoupon)).variant}>
                      {originLabel(couponWithOrigin(drilldownCoupon)).label}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Discount</p>
                    <p>{formatDiscount(drilldownCoupon.discount_type, drilldownCoupon.discount_value)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Active</p>
                    <p>{drilldownCoupon.is_active ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Issued To</p>
                    <p className="truncate">{drilldownCoupon.issued_to_email || (drilldownCoupon.issued_to_user_id ? `User …${drilldownCoupon.issued_to_user_id.slice(-6)}` : "—")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Validity</p>
                    <p>
                      {drilldownCoupon.starts_at ? new Date(drilldownCoupon.starts_at).toLocaleDateString() : "—"} → {drilldownCoupon.ends_at ? new Date(drilldownCoupon.ends_at).toLocaleDateString() : "∞"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Max Redemptions</p>
                    <p>{drilldownCoupon.max_redemptions ?? "∞"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Per User</p>
                    <p>{drilldownCoupon.max_redemptions_per_user ?? "∞"}</p>
                  </div>
                </div>

                {/* Origin-specific details */}
                {couponWithOrigin(drilldownCoupon)?.startsWith("referral_") && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-sm font-medium">Referral Reward Details</p>
                    {drilldownRewards && drilldownRewards.length > 0 ? (
                      drilldownRewards.map((rw) => (
                        <div key={rw.id} className="rounded-md border p-3 text-sm space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Level {rw.level}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(rw.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Beneficiary: <span className="font-mono">…{rw.beneficiary_id.slice(-6)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Trigger user: <span className="font-mono">…{rw.trigger_user_id.slice(-6)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Tournament: <span className="font-mono">…{rw.trigger_tournament_id.slice(-8)}</span>
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No reward record found for this coupon.</p>
                    )}
                  </div>
                )}

                {couponWithOrigin(drilldownCoupon) === "profile_reward" && (
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium">Profile Completion Reward</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This coupon was issued as a reward for completing organizer profile fields.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
