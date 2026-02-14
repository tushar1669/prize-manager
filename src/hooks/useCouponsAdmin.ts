import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import type { Coupon, CouponFormData, CouponRedemption } from "@/components/martech/types";
import { emptyCouponForm } from "@/components/martech/types";

const COUPON_SQL_FIX_URL = "https://supabase.com/dashboard/project/_/sql/new";

function isCouponsAccessBlocked(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; status?: number; message?: string; details?: string; hint?: string };
  if (candidate.code === "42501" || candidate.status === 403) return true;
  const joined = [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ").toLowerCase();
  return joined.includes("42501") || joined.includes("permission denied") || joined.includes("forbidden") || joined.includes("row-level security");
}

export function useCouponsAdmin() {
  const { user } = useAuth();
  const { isMaster } = useUserRole();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormData>(emptyCouponForm);

  const couponsQuery = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
    enabled: !!user && isMaster,
  });

  const redemptionsQuery = useQuery({
    queryKey: ["admin-coupon-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CouponRedemption[];
    },
    enabled: !!user && isMaster,
  });

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
        const { error } = await supabase.from("coupons").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
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

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("coupons").update({ is_active }).eq("id", id);
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
      max_redemptions_per_user: c.max_redemptions_per_user != null ? String(c.max_redemptions_per_user) : "",
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

  const couponsAccessBlocked = isCouponsAccessBlocked(couponsQuery.error);
  const redemptionsAccessBlocked = isCouponsAccessBlocked(redemptionsQuery.error);

  return {
    coupons: couponsQuery.data ?? [],
    redemptions: redemptionsQuery.data ?? [],
    couponsLoading: couponsQuery.isLoading,
    redemptionsLoading: redemptionsQuery.isLoading,
    couponsAccessBlocked,
    redemptionsAccessBlocked,
    anyAccessBlocked: couponsAccessBlocked || redemptionsAccessBlocked,
    sqlFixUrl: COUPON_SQL_FIX_URL,
    dialogOpen,
    setDialogOpen,
    editingCoupon,
    form,
    setForm,
    saveMutation,
    toggleMutation,
    openCreate,
    openEdit,
    handleSave,
  };
}
