import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, Plus, BarChart3 } from "lucide-react";
import { toast } from "sonner";

import type { Coupon, CouponRedemption, CouponFormData } from "@/components/martech/types";
import { emptyCouponForm } from "@/components/martech/types";
import { CouponFormDialog } from "@/components/martech/CouponFormDialog";
import { CouponTable } from "@/components/martech/CouponTable";
import { CouponAnalytics } from "@/components/martech/CouponAnalytics";

interface AdminMartechProps {
  embeddedInAdmin?: boolean;
}

export default function AdminMartech({ embeddedInAdmin = false }: AdminMartechProps) {
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

  // Fetch redemptions
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
      const payload: Record<string, unknown> = {
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
        issued_to_email: data.issued_to_email?.trim() || null,
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
      toast.error(err instanceof Error ? err.message : "Failed to save coupon");
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
      issued_to_email: c.issued_to_email ?? "",
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
        {!embeddedInAdmin && <AppNav />}
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
      {!embeddedInAdmin && <AppNav />}

      <div className={embeddedInAdmin ? "px-0 py-0 max-w-6xl" : "container mx-auto px-6 py-8 max-w-6xl"}>
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
                <CouponTable
                  coupons={coupons ?? []}
                  redemptions={redemptions}
                  isLoading={couponsLoading}
                  onEdit={openEdit}
                  onToggleActive={(id, is_active) => toggleMutation.mutate({ id, is_active })}
                  isToggling={toggleMutation.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <CouponAnalytics coupons={coupons} redemptions={redemptions} />
          </TabsContent>
        </Tabs>
      </div>

      <CouponFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        editingCoupon={editingCoupon}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
      />
    </div>
  );
}
