import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentAccess } from "@/hooks/useTournamentAccess";
import { useAuth } from "@/hooks/useAuth";
import { getSafeReturnToPath } from "@/utils/upgradeUrl";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

const PRO_PRICE_INR = 2000;
const UPI_ID = "9559161414-5@ybl";
const PAYEE_NAME = "Tushar Saraswat";

type RedeemCouponResponse = { amount_after: number; discount_amount: number; reason: string };

function getCouponErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  switch (raw) {
    case "coupon_not_found":
    case "coupon_inactive":
    case "coupon_expired":
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
  const [utrValue, setUtrValue] = useState("");
  const [upiCopied, setUpiCopied] = useState(false);
  const { user } = useAuth();

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

  // Fetch latest payment status for this tournament + user
  const { data: latestPayment, isLoading: paymentLoading } = useQuery({
    queryKey: ["tournament-payment-status", id, user?.id],
    enabled: !!id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournament_payments")
        .select("id, status, review_note, utr, created_at")
        .eq("tournament_id", id!)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
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
      const rec = row as Record<string, unknown>;

      const amountAfter = typeof rec.amount_after === "number" ? rec.amount_after : 0;
      const discountAmount = typeof rec.discount_amount === "number" ? rec.discount_amount : 0;
      const reason = typeof rec.reason === "string" ? rec.reason : "";

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

  // Submit manual UPI payment claim
  const submitPaymentMutation = useMutation({
    mutationFn: async (utr: string) => {
      if (!id) throw new Error("Tournament ID missing");
      const trimmedUtr = utr.trim();
      if (trimmedUtr.length < 6) throw new Error("INVALID_UTR");

      const { data, error } = await supabase.rpc("submit_tournament_payment_claim" as never, {
        p_tournament_id: id,
        p_amount_inr: PRO_PRICE_INR,
        p_utr: trimmedUtr,
      } as never);

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("Payment submitted. Awaiting admin approval.");
      setUtrValue("");
      queryClient.invalidateQueries({ queryKey: ["tournament-payment-status", id, user?.id] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "PENDING_PAYMENT_ALREADY_EXISTS") {
        toast.error("You already have a pending payment for this tournament.");
      } else if (msg === "INVALID_UTR") {
        toast.error("Please enter a valid UTR (at least 6 characters).");
      } else {
        const normalized = normalizeError(error);
        toast.error(toastMessage(normalized));
        logAuditEvent({
          eventType: "payment_error",
          message: msg,
          friendlyMessage: normalized.friendlyMessage,
          referenceId: normalized.referenceId,
          context: { tournament_id: id },
        });
      }
    },
  });

  const couponHighlighted = useMemo(() => searchParams.get("coupon") === "1", [searchParams]);

  const returnTo = useMemo(() => {
    if (!id) return "/dashboard";
    return getSafeReturnToPath(id, searchParams.get("return_to"), `/t/${id}/finalize`);
  }, [id, searchParams]);

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setUpiCopied(true);
      setTimeout(() => setUpiCopied(false), 2000);
    } catch {
      toast.error("Failed to copy UPI ID");
    }
  };

  const paymentStatus = latestPayment?.status as string | undefined;
  const canSubmitPayment = !hasFullAccess && paymentStatus !== "pending" && paymentStatus !== "approved";

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
            <p className="pt-1 font-medium text-foreground">Pro plan price: ₹{PRO_PRICE_INR}</p>
          </CardContent>
        </Card>

        {/* Already Pro */}
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

        {/* Payment status banner */}
        {!paymentLoading && latestPayment && (
          <>
            {paymentStatus === "pending" && (
              <Card className="border-amber-300 dark:border-amber-800">
                <CardContent className="pt-6 flex items-start gap-3">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Payment pending approval</p>
                    <p className="text-xs text-muted-foreground mt-1">UTR: {latestPayment.utr} · Submitted {new Date(latestPayment.created_at).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {paymentStatus === "approved" && !hasFullAccess && (
              <Card className="border-emerald-300 dark:border-emerald-900">
                <CardContent className="pt-6 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">Payment approved — Pro active.</p>
                </CardContent>
              </Card>
            )}
            {paymentStatus === "rejected" && (
              <Card className="border-destructive/50">
                <CardContent className="pt-6 flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Payment rejected</p>
                    {latestPayment.review_note && (
                      <p className="text-xs text-muted-foreground mt-1">Reason: {latestPayment.review_note}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">You may re-submit with a valid UTR below.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Coupon section — preserved exactly */}
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

        {/* UPI Payment section — new */}
        {!hasFullAccess && (
          <Card>
            <CardHeader>
              <CardTitle>Pay via UPI</CardTitle>
              <CardDescription>
                Pay ₹{PRO_PRICE_INR} using any UPI app, then submit your UTR for verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* QR + UPI details */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="border rounded-lg p-2 bg-card shrink-0">
                  <img
                    src="/payments/upi-qr.png"
                    alt="UPI QR Code"
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">UPI ID</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{UPI_ID}</code>
                      <Button variant="ghost" size="sm" onClick={handleCopyUpi} className="h-7 px-2">
                        {upiCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payee</p>
                    <p className="text-sm mt-1">{PAYEE_NAME}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</p>
                    <p className="text-sm font-semibold mt-1">₹{PRO_PRICE_INR}</p>
                  </div>
                </div>
              </div>

              {/* UTR input */}
              {canSubmitPayment && (
                <div className="space-y-3 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="utr-input">UTR / Transaction Reference</Label>
                    <Input
                      id="utr-input"
                      placeholder="Enter 12-digit UTR number"
                      value={utrValue}
                      onChange={(e) => setUtrValue(e.target.value)}
                      disabled={submitPaymentMutation.isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Find the UTR in your UPI app&apos;s transaction details after paying.
                    </p>
                  </div>
                  <Button
                    onClick={() => submitPaymentMutation.mutate(utrValue)}
                    disabled={utrValue.trim().length < 6 || submitPaymentMutation.isPending}
                  >
                    {submitPaymentMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                      </span>
                    ) : (
                      "Submit Payment for Approval"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
