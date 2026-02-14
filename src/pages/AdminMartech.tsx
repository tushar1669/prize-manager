import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Ticket, Plus, Pencil, BarChart3, Users, Hash, IndianRupee } from "lucide-react";
import { toast } from "sonner";

// Types (tables not yet in generated types)
type Coupon = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_user: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CouponRedemption = {
  id: string;
  coupon_id: string;
  user_id: string;
  discount_amount: number;
  redeemed_at: string;
  metadata: Record<string, unknown>;
};

type CouponFormData = {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  starts_at: string;
  ends_at: string;
  max_redemptions: string;
  max_redemptions_per_user: string;
  is_active: boolean;
};

const emptyCouponForm: CouponFormData = {
  code: "",
  discount_type: "percentage",
  discount_value: "",
  starts_at: "",
  ends_at: "",
  max_redemptions: "",
  max_redemptions_per_user: "1",
  is_active: true,
};

function formatDiscount(type: string, value: number) {
  return type === "percentage" ? `${value}%` : `₹${value}`;
}

export default function AdminMartech() {
  const { user } = useAuth();
  const { isMaster, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormData>(emptyCouponForm);

  // Fetch coupons
  const { data: coupons, isLoading: couponsLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
    enabled: !!user && isMaster,
  });

  // Fetch redemptions for analytics
  const { data: redemptions } = useQuery({
    queryKey: ["admin-coupon-redemptions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("coupon_redemptions")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CouponRedemption[];
    },
    enabled: !!user && isMaster,
  });

  // Create / Update coupon
  const saveMutation = useMutation({
    mutationFn: async (data: CouponFormData & { id?: string }) => {
      const payload = {
        code: data.code.trim().toUpperCase(),
        discount_type: data.discount_type,
        discount_value: Number(data.discount_value) || 0,
        starts_at: data.starts_at || null,
        ends_at: data.ends_at || null,
        max_redemptions: data.max_redemptions ? Number(data.max_redemptions) : null,
        max_redemptions_per_user: data.max_redemptions_per_user
          ? Number(data.max_redemptions_per_user)
          : null,
        is_active: data.is_active,
      };

      if (data.id) {
        const { error } = await (supabase as any)
          .from("coupons")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("coupons")
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success(editingCoupon ? "Coupon updated" : "Coupon created");
      setDialogOpen(false);
      setEditingCoupon(null);
      setForm(emptyCouponForm);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save coupon";
      toast.error(msg);
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("coupons")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success("Coupon status updated");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    },
  });

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(emptyCouponForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : "",
      ends_at: c.ends_at ? c.ends_at.slice(0, 16) : "",
      max_redemptions: c.max_redemptions != null ? String(c.max_redemptions) : "",
      max_redemptions_per_user:
        c.max_redemptions_per_user != null ? String(c.max_redemptions_per_user) : "",
      is_active: c.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    if (!form.discount_value || Number(form.discount_value) <= 0) {
      toast.error("Discount value must be positive");
      return;
    }
    saveMutation.mutate({ ...form, id: editingCoupon?.id });
  };

  // Analytics computations
  const analytics = (() => {
    if (!redemptions || !coupons) return null;

    const totalRedemptions = redemptions.length;
    const uniqueRedeemers = new Set(redemptions.map((r) => r.user_id)).size;
    const totalDiscountAmount = redemptions.reduce((sum, r) => sum + Number(r.discount_amount), 0);

    // Per-coupon breakdown
    const couponMap = new Map(coupons.map((c) => [c.id, c]));
    const perCoupon = new Map<string, { count: number; amount: number }>();
    for (const r of redemptions) {
      const entry = perCoupon.get(r.coupon_id) ?? { count: 0, amount: 0 };
      entry.count++;
      entry.amount += Number(r.discount_amount);
      perCoupon.set(r.coupon_id, entry);
    }

    return {
      totalRedemptions,
      uniqueRedeemers,
      totalDiscountAmount,
      perCoupon: Array.from(perCoupon.entries()).map(([couponId, stats]) => ({
        coupon: couponMap.get(couponId),
        ...stats,
      })),
    };
  })();

  // Access guard
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground">Master access required.</p>
          <Button className="mt-6" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin: Martech</h1>
          <p className="text-muted-foreground">Coupons, analytics, and marketing tools</p>
        </div>

        <Tabs defaultValue="coupons">
          <TabsList>
            <TabsTrigger value="coupons" className="gap-1.5">
              <Ticket className="h-4 w-4" /> Coupons
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5">
              <BarChart3 className="h-4 w-4" /> Analytics
            </TabsTrigger>
          </TabsList>

          {/* ===== COUPONS TAB ===== */}
          <TabsContent value="coupons">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Coupon Codes</CardTitle>
                  <CardDescription>Create and manage discount coupons</CardDescription>
                </div>
                <Button onClick={openCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" /> New Coupon
                </Button>
              </CardHeader>
              <CardContent>
                {couponsLoading ? (
                  <div className="py-8 flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : !coupons || coupons.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Ticket className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No coupons yet. Create one to get started.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Valid</TableHead>
                        <TableHead>Limits</TableHead>
                        <TableHead>Redemptions</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((c) => {
                        const redeemCount =
                          redemptions?.filter((r) => r.coupon_id === c.id).length ?? 0;
                        return (
                          <TableRow key={c.id}>
                            <TableCell>
                              <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                                {c.code}
                              </code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {formatDiscount(c.discount_type, c.discount_value)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.starts_at
                                ? new Date(c.starts_at).toLocaleDateString()
                                : "—"}{" "}
                              →{" "}
                              {c.ends_at
                                ? new Date(c.ends_at).toLocaleDateString()
                                : "∞"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.max_redemptions != null
                                ? `${redeemCount}/${c.max_redemptions}`
                                : "∞"}
                              {c.max_redemptions_per_user != null &&
                                ` (${c.max_redemptions_per_user}/user)`}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{redeemCount}</Badge>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={c.is_active}
                                onCheckedChange={(checked) =>
                                  toggleMutation.mutate({ id: c.id, is_active: checked })
                                }
                                disabled={toggleMutation.isPending}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ANALYTICS TAB ===== */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Hash className="h-8 w-8 text-primary opacity-70" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Redemptions</p>
                      <p className="text-2xl font-bold text-foreground">
                        {analytics?.totalRedemptions ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary opacity-70" />
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Redeemers</p>
                      <p className="text-2xl font-bold text-foreground">
                        {analytics?.uniqueRedeemers ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <IndianRupee className="h-8 w-8 text-primary opacity-70" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total Discount Given</p>
                      <p className="text-2xl font-bold text-foreground">
                        ₹{analytics?.totalDiscountAmount?.toLocaleString("en-IN") ?? 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Per-Coupon Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics && analytics.perCoupon.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coupon Code</TableHead>
                        <TableHead>Redemptions</TableHead>
                        <TableHead>Total Discount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.perCoupon.map((row) => (
                        <TableRow key={row.coupon?.id ?? "unknown"}>
                          <TableCell>
                            <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">
                              {row.coupon?.code ?? "Deleted"}
                            </code>
                          </TableCell>
                          <TableCell>{row.count}</TableCell>
                          <TableCell>₹{row.amount.toLocaleString("en-IN")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No redemptions yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== CREATE / EDIT DIALOG ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_redemptions: e.target.value }))
                  }
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editingCoupon ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
