import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentAccess } from "@/hooks/useTournamentAccess";
import { getSafeReturnToPath } from "@/utils/upgradeUrl";

const PRO_PRICE_INR = 100;
type RedeemCouponResponse = { amount_after: number; discount_amount: number; reason: string };

function getCouponErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  switch (raw) {
    case "coupon_not_found":
      return "Invalid/expired coupon";
    case "coupon_inactive":
      return "Invalid/expired coupon";
    case "coupon_expired":
      return "Invalid/expired coupon";
    case "coupon_not_started":
      return "Invalid/expired coupon";
    case "max_redemptions_reached":
      return "Coupon limit reached";
    case "max_redemptions_per_user_reached":
      return "You already used this coupon";
    case "coupon_not_issued_to_user":
      return "This coupon is not assigned to your account.";
    case "not_authorized_for_tournament":
      return "You are not authorized to upgrade this tournament.";
    default:
      return "Unable to apply coupon. Please try again.";
  }
}

export default function TournamentUpgrade() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [couponCode, setCouponCode] = useState("");

  const { hasFullAccess, isLoading: accessLoading } = useTournamentAccess(id);

  const { data: tournament, isLoading: tournamentLoading } = useQuery({
    queryKey: ["tournament-upgrade", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("title")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const applyCouponMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!id) throw new Error("Tournament ID missing");
      const normalizedCode = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc('redeem_coupon_for_tournament' as never, {
        code: normalizedCode,
        tournament_id: id,
        amount_before: PRO_PRICE_INR,
      } as never);

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Coupon response missing");
      const row = Array.isArray(data) ? (data[0] ?? null) : data;
      if (!row || typeof row !== "object") throw new Error("Coupon response missing");

      const amountAfter = typeof row.amount_after === "number" ? row.amount_after : 0;
      const discountAmount = typeof row.discount_amount === "number" ? row.discount_amount : 0;
      const reason = typeof row.reason === "string" ? row.reason : "";

      return {
        amount_after: amountAfter,
        discount_amount: discountAmount,
        reason,
      } satisfies RedeemCouponResponse;
    },
    onSuccess: async (result) => {
      if (result.amount_after > 0) {
        toast.success(`Coupon applied. Remaining amount: ₹${result.amount_after}`);
        return;
      }

      toast.success("Coupon applied. Pro access unlocked for this tournament.");
      await queryClient.invalidateQueries({ queryKey: ["tournament-access", id] });
      await queryClient.refetchQueries({ queryKey: ["tournament-access", id] });
      navigate(returnTo, { replace: true, state: { upgraded: true } });
    },
    onError: (error) => {
      toast.error(getCouponErrorMessage(error));
    },
  });

  const couponHighlighted = useMemo(() => searchParams.get("coupon") === "1", [searchParams]);

  const returnTo = useMemo(() => {
    if (!id) return "/dashboard";
    return getSafeReturnToPath(id, searchParams.get("return_to"), `/t/${id}/finalize`);
  }, [id, searchParams]);


  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <BackBar to={id ? returnTo : "/dashboard"} label="Back" />

        <Card>
          <CardHeader>
            <CardTitle>Upgrade to Pro</CardTitle>
            <CardDescription>
              Unlock all final prize views, full exports, and printing for <span className="font-medium text-foreground">{tournament?.title ?? "this tournament"}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc space-y-1 pl-5">
              <li>Access all winners and category cards without preview limits.</li>
              <li>Unlock Poster Grid and Arbiter Sheet views on finalize.</li>
              <li>Enable XLSX export and print actions from finalize.</li>
            </ul>
            <p className="pt-1">Pro plan price: ₹{PRO_PRICE_INR}. Use a coupon below if you have one.</p>
          </CardContent>
        </Card>

        {!accessLoading && hasFullAccess && (
          <Card className="border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">This tournament already has Pro access.</p>
              <Button className="mt-3" onClick={() => navigate(returnTo)}>
                Return
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className={couponHighlighted ? "border-primary/60" : ""}>
          <CardHeader>
            <CardTitle>Apply Coupon</CardTitle>
            <CardDescription>Enter your code to unlock Pro immediately when eligible.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="coupon-code">Coupon code</Label>
              <Input
                id="coupon-code"
                placeholder="ENTER-CODE"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                disabled={applyCouponMutation.isPending || hasFullAccess}
              />
            </div>
            <Button
              onClick={() => applyCouponMutation.mutate(couponCode)}
              disabled={!couponCode.trim() || applyCouponMutation.isPending || hasFullAccess || tournamentLoading}
            >
              {applyCouponMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Applying coupon...
                </span>
              ) : (
                "Apply Coupon"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
