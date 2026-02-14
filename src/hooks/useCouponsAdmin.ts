import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import type { Coupon, CouponFormData, CouponRedemption } from "@/components/martech/types";
import { emptyCouponForm } from "@/components/martech/types";
import {
  buildCouponPayload,
  normalizeDiscountTypeForUi,
  toDateTimeLocalInput,
} from "@/lib/coupons/constants";

const COUPON_SQL_FIX_URL = "https://supabase.com/dashboard/project/_/sql/new";

function isCouponsAccessBlocked(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; status?: number; message?: string; details?: string; hint?: string };
  if (candidate.code === "42501" || candidate.status === 403) return true;
  const joined = [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ").toLowerCase();
  return joined.includes("42501") || joined.includes("permission denied") || joined.includes("forbidden") || joined.includes("row-level security");
}

function extractConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { constraint?: string; message?: string; details?: string };
  if (candidate.constraint) return candidate.constraint;
  const combined = `${candidate.message ?? ""} ${candidate.details ?? ""}`;
  const match = combined.match(/constraint\s+"([^"]+)"/i);
  return match?.[1] ?? null;
}

function getCouponErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Failed to save coupon";
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };

  if (candidate.code === "23505") {
    const lower = [candidate.message, candidate.details, candidate.hint].join(" ").toLowerCase();
    if (lower.includes("code")) {
      return "Code already exists";
    }
  }

  if (candidate.code === "23514") {
    const constraintName = extractConstraintName(error) ?? "unknown_constraint";
    return `Invalid coupon settings (constraint: ${constraintName})`;
  }

  return candidate.message ?? "Failed to save coupon";
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
      const payload = buildCouponPayload(data, data.id ? null : user?.id);

      if (data.id) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("coupons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast.success(editingCoupon ? "Coupon updated" : "Coupon created");
      setDialogOpen(false);
      setEditingCoupon(null);
      setForm(emptyCouponForm);
    },
    onError: (err: unknown) => {
      toast.error(getCouponErrorMessage(err));
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
      discount_type: normalizeDiscountTypeForUi(c.discount_type),
      discount_value: String(c.discount_value),
      starts_at: toDateTimeLocalInput(c.starts_at),
      ends_at: toDateTimeLocalInput(c.ends_at),
      max_redemptions: c.max_redemptions != null ? String(c.max_redemptions) : "",
      max_redemptions_per_user: c.max_redemptions_per_user != null ? String(c.max_redemptions_per_user) : "",
      is_active: c.is_active,
      issued_to_email: c.issued_to_email ?? "",
      applies_to: c.applies_to === "tournament_pro" ? c.applies_to : "tournament_pro",
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
