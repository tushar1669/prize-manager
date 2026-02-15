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
} from "@/lib/coupons/constants";

const COUPON_SQL_FIX_URL = "https://supabase.com/dashboard/project/_/sql/new";
const COUPON_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUPON_CODE_LENGTH = 8;

function generateCouponCode(length = COUPON_CODE_LENGTH): string {
  return Array.from({ length }, () => COUPON_CODE_ALPHABET[Math.floor(Math.random() * COUPON_CODE_ALPHABET.length)]).join("");
}

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

function isDuplicateCodeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };
  if (candidate.code !== "23505") return false;
  const lower = [candidate.message, candidate.details, candidate.hint].join(" ").toLowerCase();
  return lower.includes("code");
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
      return (data ?? []).map((row) => ({
        id: row.id,
        coupon_id: row.coupon_id,
        redeemed_by_user_id: (row as any).redeemed_by_user_id ?? (row as any).user_id,
        tournament_id: (row as any).tournament_id ?? null,
        amount_before: (row as any).amount_before ?? 0,
        discount_amount: (row as any).discount_amount ?? 0,
        amount_after: (row as any).amount_after ?? 0,
        redeemed_at: (row as any).redeemed_at,
        meta: (row as any).meta ?? (row as any).metadata ?? {},
      })) as CouponRedemption[];
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
        if (!error) return;

        if (!isDuplicateCodeError(error)) {
          throw error;
        }

        const retryPayload = { ...payload, code: generateCouponCode() };
        const { error: retryError } = await supabase.from("coupons").insert(retryPayload);
        if (retryError) throw retryError;
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
    setForm({ ...emptyCouponForm, code: generateCouponCode() });
    setDialogOpen(true);
  };

  const regenerateCreateCode = () => {
    if (editingCoupon) return;
    setForm((f) => ({ ...f, code: generateCouponCode() }));
  };

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setForm({
      code: c.code,
      discount_type: normalizeDiscountTypeForUi(c.discount_type),
      discount_value: String(c.discount_value),
      starts_at: c.starts_at ? new Date(c.starts_at) : null,
      ends_at: c.ends_at ? new Date(c.ends_at) : null,
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
    if (form.starts_at && form.ends_at && form.starts_at.getTime() > form.ends_at.getTime()) {
      toast.error("Ends At must be later than or equal to Starts At");
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
    regenerateCreateCode,
    openEdit,
    handleSave,
  };
}
