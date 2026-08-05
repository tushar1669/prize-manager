import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppNav } from "@/components/AppNav";
import { BackBar } from "@/components/BackBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Copy, CheckCircle2, Clock, XCircle } from "lucide-react";
import { uploadFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentAccess } from "@/hooks/useTournamentAccess";
import { useAuth } from "@/hooks/useAuth";
import { getSafeReturnToPath } from "@/utils/upgradeUrl";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";
import { BackendMigrationMissingAlert } from "@/components/access/BackendMigrationMissingAlert";

const UPI_ID = "9559161414-5@ybl";
const PAYEE_NAME = "Tushar Saraswat";
const SUPPORT_EMAIL = "chess.tushar@gmail.com";
const SUPPORT_PHONE = "+91-9559161414";

/**
 * Server-side UTR blocks raised by submit_tournament_payment_claim (D30/D31). Each one
 * gets a dialog rather than a toast: the organizer has just paid real money and needs
 * enough copy to work out what to do next.
 */
type UtrBlockCode =
  | "UTR_ALREADY_USED"
  | "UTR_IS_TXN_ID"
  | "UTR_MISMATCH"
  | "UTR_EXTRACTION_UNREADABLE";

type RedeemCouponResponse = { amount_after: number; discount_amount: number; reason: string };

type ProPriceRow = {
  players_count: number;
  is_free_small_tournament: boolean;
  amount_inr: number;
  tier_label: string;
  free_player_threshold: number;
};

const UTR_BLOCK_COPY: Record<UtrBlockCode, { title: string; body: string; contact: boolean }> = {
  // Deliberately says nothing about which tournament or which user consumed the UTR.
  UTR_ALREADY_USED: {
    title: "This UTR has already been used",
    body:
      "Each UPI payment can only be used for one tournament. If you paid separately for this tournament, please check you've entered the right UTR from that payment.",
    contact: true,
  },
  UTR_IS_TXN_ID: {
    title: "That's the Transaction ID, not the UTR",
    body:
      "Payment apps show two different numbers for the same payment: their own Transaction ID, and the bank's UTR (sometimes labelled UPI Ref No). We need the UTR — the number you entered is the Transaction ID.",
    contact: false,
  },
  // No extracted UTR here and no one-tap fill: the submitted value matched neither the
  // UTR nor the txn_id on the screenshot, so we have no basis for suggesting a correction.
  UTR_MISMATCH: {
    title: "UTR doesn't match your screenshot",
    body:
      "The UTR you entered doesn't match the one on the screenshot you uploaded. Please check your receipt and re-enter it, or upload the screenshot for this exact payment.",
    contact: true,
  },
  UTR_EXTRACTION_UNREADABLE: {
    title: "We couldn't read the UTR on your screenshot",
    body:
      "Please upload a clearer screenshot showing the full UTR / UPI Ref No, or remove the screenshot and submit the UTR on its own.",
    contact: true,
  },
};

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
  const [utrWasPrefilled, setUtrWasPrefilled] = useState(false);
  // The extraction can land while the organizer is still typing, and the upload
  // callback would only see the utrValue captured when it was created. The ref
  // is the live value, so the pre-fill never overwrites a keystroke it missed.
  const utrValueRef = useRef("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotStage, setScreenshotStage] = useState<
    "idle" | "uploading" | "extracting" | "done" | "error"
  >("idle");
  const [screenshotExtractionId, setScreenshotExtractionId] = useState<string | null>(null);
  // Retained from the extraction purely for dialog copy — the one-tap correction on
  // UTR_IS_TXN_ID. Never used to decide whether a submission may proceed.
  const [extractedUtr, setExtractedUtr] = useState<string | null>(null);
  const [extractedTxnId, setExtractedTxnId] = useState<string | null>(null);
  // Advisory only (D31): /extract saw this UTR on another payment. The extracted value
  // can be an OCR misread, so this warns and never blocks — the server check is the truth.
  const [utrDuplicateWarning, setUtrDuplicateWarning] = useState(false);
  const [utrBlock, setUtrBlock] = useState<UtrBlockCode | null>(null);
  const [upiCopied, setUpiCopied] = useState(false);
  const [amountDue, setAmountDue] = useState(0);
  const { user } = useAuth();

  const { hasFullAccess, isLoading: accessLoading, errorCode: accessErrorCode } = useTournamentAccess(id);
  const hasBackendMigrationIssue = accessErrorCode === "backend_migration_missing";


  const { data: proPrice, isLoading: pricingLoading } = useQuery({
    queryKey: ["tournament-pro-price", id],
    enabled: !!id && !hasBackendMigrationIssue,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tournament_pro_price", { tournament_id: id! });
      if (error) throw error;
      const row: ProPriceRow | null = Array.isArray(data) ? data[0] ?? null : data;
      if (!row) throw new Error("Pricing response missing");
      return row;
    },
  });

  useEffect(() => {
    if (proPrice) setAmountDue(proPrice.amount_inr);
  }, [proPrice]);

  const baseAmount = proPrice?.amount_inr ?? 0;
  const isFreeTier = proPrice?.is_free_small_tournament ?? false;

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
    refetchInterval: (query) => {
      // Auto-poll while pending so UI updates when master approves
      const status = (query.state.data as { status?: string } | null)?.status;
      return status === "pending" ? 10000 : false;
    },
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
        amount_before: baseAmount,
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
        setAmountDue(result.amount_after);
        toast.success(`Coupon applied! Remaining amount: ₹${result.amount_after}`);
        return;
      }

      toast.success("Coupon applied. Pro access unlocked for this tournament.");
      await queryClient.invalidateQueries({ queryKey: ["tournament-access", id] });
      await queryClient.refetchQueries({ queryKey: ["tournament-access", id] });
      navigate(returnTo, { replace: true, state: { upgraded: true } });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg === "already_free") {
        toast.error("This tournament is already within the free tier.");
      } else if (msg === "amount_before_mismatch") {
        toast.error("Tournament pricing changed. Please refresh and try again.");
      } else {
        toast.error(getCouponErrorMessage(error));
      }
    },
  });

  const handleScreenshotFile = useCallback(
    async (file: File) => {
      if (!user) return;
      const ACCEPTED: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/heif": ".heic",
      };
      if (!ACCEPTED[file.type]) {
        toast.error("Use a JPEG, PNG, WebP or HEIC screenshot.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Screenshot must be under 10MB.");
        return;
      }

      setScreenshotFile(file);
      setScreenshotStage("uploading");
      setScreenshotExtractionId(null);
      setExtractedUtr(null);
      setExtractedTxnId(null);
      setUtrDuplicateWarning(false);

      try {
        // Without a tournament id the path would read ".../payments/undefined/…",
        // so fail into the same non-fatal error state as any other upload problem.
        if (!id) throw new Error("Tournament ID missing");
        const ext = ACCEPTED[file.type];
        const storagePath = `${user.id}/payments/${id}/${crypto.randomUUID()}${ext}`;
        const { path: storedPath, error: uploadErr } = await uploadFile(
          "extraction-uploads",
          storagePath,
          file,
        );
        if (uploadErr || !storedPath) throw new Error(uploadErr?.message ?? "Upload failed");

        // Hash via built-in browser crypto — no external dependency
        const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const fileHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const { data: doc, error: docErr } = await supabase
          .from("extraction_documents")
          .insert({
            uploaded_by: user.id,
            file_name: file.name,
            file_path: storedPath,
            file_hash: fileHash,
            file_size_bytes: file.size,
            mime_type: file.type,
            doc_type: "payment_screenshot" as never,
            privacy_class: "public",
            status: "pending",
          })
          .select("id")
          .single();
        if (docErr || !doc) throw new Error(docErr?.message ?? "Could not register screenshot");

        setScreenshotStage("extracting");

        const controller = new AbortController();
        const abortTimer = window.setTimeout(() => controller.abort(), 90_000);
        let invokeResult: Awaited<ReturnType<typeof supabase.functions.invoke>>;
        try {
          invokeResult = await supabase.functions.invoke("extract", {
            body: { document_id: doc.id, tournament_id: id },
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(abortTimer);
        }

        const extractionId =
          typeof invokeResult.data?.extraction_id === "string"
            ? invokeResult.data.extraction_id
            : null;
        if (!extractionId) throw new Error("No extraction ID returned");

        setScreenshotExtractionId(extractionId);
        setScreenshotStage("done");

        // Advisory duplicate warning (D31): field_flags comes back on the invoke response
        // itself, so this surfaces seconds after upload — before the organizer hits Submit.
        const responseFlags = (invokeResult.data as { field_flags?: unknown } | null)
          ?.field_flags;
        if (
          Array.isArray(responseFlags) &&
          responseFlags.some(
            (flag: unknown) =>
              !!flag &&
              typeof flag === "object" &&
              (flag as { reason?: unknown }).reason === "utr_duplicate",
          )
        ) {
          setUtrDuplicateWarning(true);
        }

        // Best-effort UTR pre-fill. /extract returns metadata only (extraction_id,
        // status, confidence, field_flags, schema_version, ocr_*), never the payload,
        // so read the row back. Everything here is swallowed: a failed pre-fill must
        // leave the screenshot "done" and manual entry working exactly as before.
        try {
          const { data: extraction, error: prefillErr } = await supabase
            .from("extractions")
            .select("payload")
            .eq("id", extractionId)
            .maybeSingle();
          if (prefillErr) throw prefillErr;

          const payload = extraction?.payload as Record<string, unknown> | null;
          const payloadUtr =
            payload && typeof payload.utr === "string" ? payload.utr.trim() : "";
          const payloadTxnId =
            payload && typeof payload.txn_id === "string" ? payload.txn_id.trim() : "";

          // Retained for the block dialogs only — never for gating the submission.
          setExtractedUtr(payloadUtr || null);
          setExtractedTxnId(payloadTxnId || null);

          // Never overwrite what the organizer has already typed.
          if (payloadUtr && !utrValueRef.current.trim()) {
            utrValueRef.current = payloadUtr;
            setUtrValue(payloadUtr);
            setUtrWasPrefilled(true);
          }
        } catch (prefillErr) {
          console.error("[payment-screenshot] UTR pre-fill failed", prefillErr);
        }
      } catch (err) {
        console.error("[payment-screenshot] failed", err);
        setScreenshotStage("error");
        // Non-fatal: user can still submit UTR without screenshot
      }
    },
    [user, id],
  );

  // Submit manual UPI payment claim
  const submitPaymentMutation = useMutation({
    mutationFn: async ({ utr, extractionId }: { utr: string; extractionId: string | null }) => {
      if (!id) throw new Error("Tournament ID missing");
      const trimmedUtr = utr.trim();
      if (trimmedUtr.length < 6) throw new Error("INVALID_UTR");

      // 5-arg overload: it has no defaults, so PostgREST only resolves it when all
      // five keys are present. The screenshot link is written inside the same INSERT,
      // which is why there is no follow-up UPDATE from the client any more.
      const { data, error } = await supabase.rpc("submit_tournament_payment_claim" as never, {
        p_tournament_id: id,
        p_amount_inr: amountDue,
        p_utr: trimmedUtr,
        p_screenshot_extraction_id: extractionId ?? null,
        p_return_to: returnToForClaim,
      } as never);

      if (error) throw new Error(error.message);

      return data;
    },
    onSuccess: () => {
      toast.success("Payment submitted. Awaiting admin approval.");
      utrValueRef.current = "";
      setUtrValue("");
      setUtrWasPrefilled(false);
      queryClient.invalidateQueries({ queryKey: ["tournament-payment-status", id, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["tournament-access", id] });
    },
    onError: (error, variables) => {
      const msg = error instanceof Error ? error.message : String(error);

      // Every server-side UTR block is audited (D31) so the false-positive rate is
      // measurable in week one. The RPC raises these as bare strings.
      const logBlocked = (code: string) => {
        void logAuditEvent({
          eventType: "payment_blocked",
          message: code,
          referenceId: normalizeError(error).referenceId,
          context: {
            tournament_id: id,
            had_screenshot: variables.extractionId !== null,
          },
        });
      };

      if (msg === "PENDING_PAYMENT_ALREADY_EXISTS") {
        toast.error("You already have a pending payment for this tournament.");
      } else if (msg === "INVALID_UTR") {
        toast.error("Please enter a valid UTR (at least 6 characters).");
      } else if (
        msg === "UTR_ALREADY_USED" ||
        msg === "UTR_IS_TXN_ID" ||
        msg === "UTR_MISMATCH" ||
        msg === "UTR_EXTRACTION_UNREADABLE"
      ) {
        logBlocked(msg);
        setUtrBlock(msg);
      } else if (msg === "EXTRACTION_NOT_OWNED") {
        logBlocked(msg);
        toast.error("Something went wrong with your screenshot. Please re-upload it.");
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

  // Only record an origin we actually have evidence for. With the param present the
  // organizer came from a paywall and we know where they were blocked; without it
  // they walked here directly, so we write NULL and the approval email falls back to
  // the tournament landing page rather than a guessed destination.
  const returnToForClaim = useMemo(
    () => (searchParams.get("return_to") ? returnTo : null),
    [searchParams, returnTo],
  );

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

        <BackendMigrationMissingAlert
          errorCode={accessErrorCode}
          onRetry={() => window.location.reload()}
        />

        {!hasBackendMigrationIssue && (
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
            <div className="pt-1 space-y-1 font-medium text-foreground">
              <p>0–150 players: Free</p>
              <p>151–500 players: ₹500</p>
              <p>501+ players: ₹1000</p>
              {proPrice && <p>Current tournament: {proPrice.players_count} players · {isFreeTier ? "Free" : `₹${baseAmount}`}</p>}
            </div>
          </CardContent>
        </Card>
        )}

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

        {!accessLoading && !hasFullAccess && isFreeTier && (
          <Card className="border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">This tournament is within the free tier.</p>
              <Button className="mt-3" onClick={() => navigate(returnTo)}>
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Payment status banner */}
        {!hasBackendMigrationIssue && !paymentLoading && latestPayment && (
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
        {!hasBackendMigrationIssue && !pricingLoading && !isFreeTier && (
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
              disabled={!couponCode.trim() || applyCouponMutation.isPending || hasFullAccess || tournamentLoading || pricingLoading || baseAmount <= 0}
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
        )}

        {/* UPI Payment section — new */}
        {!hasBackendMigrationIssue && !hasFullAccess && !pricingLoading && !isFreeTier && (
          <Card>
            <CardHeader>
              <CardTitle>Pay via UPI</CardTitle>
              <CardDescription>
                Pay ₹{amountDue} using any UPI app, then submit your UTR for verification.
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
                     <p className="text-sm font-semibold mt-1">₹{amountDue}</p>
                  </div>
                </div>
              </div>

              {amountDue < baseAmount && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                  Pay exactly ₹{amountDue} (after coupon discount). Paying ₹{baseAmount} may cause your claim to be rejected.
                </p>
              )}

              {/* UTR input */}
              {canSubmitPayment && (
                <div className="space-y-3 border-t pt-4">
                  {/* Phase 2A: optional payment screenshot */}
                  <div className="space-y-2">
                    <Label>
                      Payment screenshot{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional — speeds up approval)
                      </span>
                    </Label>
                    <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:border-primary/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic"
                        className="hidden"
                        disabled={submitPaymentMutation.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleScreenshotFile(file);
                          e.target.value = "";
                        }}
                      />
                      {screenshotStage === "idle" && (
                        <span className="text-muted-foreground">
                          Choose screenshot from your UPI app…
                        </span>
                      )}
                      {(screenshotStage === "uploading" || screenshotStage === "extracting") && (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                          <span className="text-muted-foreground">
                            {screenshotStage === "uploading" ? "Uploading…" : "Reading screenshot…"}
                          </span>
                        </>
                      )}
                      {screenshotStage === "done" && (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="truncate text-emerald-700 dark:text-emerald-400">
                            {screenshotFile?.name ?? "Screenshot ready"}
                          </span>
                        </>
                      )}
                      {screenshotStage === "error" && (
                        <span className="text-xs text-destructive">
                          Could not read screenshot — you can still submit with UTR only
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="utr-input">UTR / Transaction Reference</Label>
                    <Input
                      id="utr-input"
                      placeholder="Enter 12-digit UTR number"
                      value={utrValue}
                      onChange={(e) => {
                        utrValueRef.current = e.target.value;
                        setUtrValue(e.target.value);
                        setUtrWasPrefilled(false);
                      }}
                      disabled={submitPaymentMutation.isPending}
                    />
                    {utrWasPrefilled && (
                      <p className="text-xs text-muted-foreground">
                        Pre-filled from your screenshot — please check it matches your UPI app.
                      </p>
                    )}
                    {utrDuplicateWarning && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                        This UTR looks like one already used on this platform. If that&apos;s
                        unexpected, double-check your receipt before submitting.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Find the UTR in your UPI app&apos;s transaction details after paying.
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      submitPaymentMutation.mutate({ utr: utrValue, extractionId: screenshotExtractionId })
                    }
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

      {/* Server-side UTR blocks (D30/D31). Informational — dismissing returns the
          organizer to the form with what they typed intact. */}
      <AlertDialog
        open={utrBlock !== null}
        onOpenChange={(open) => {
          if (!open) setUtrBlock(null);
        }}
      >
        <AlertDialogContent>
          {utrBlock && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{UTR_BLOCK_COPY[utrBlock].title}</AlertDialogTitle>
                <AlertDialogDescription>{UTR_BLOCK_COPY[utrBlock].body}</AlertDialogDescription>
              </AlertDialogHeader>

              {utrBlock === "UTR_IS_TXN_ID" && (
                <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
                  {extractedTxnId && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Transaction ID on your screenshot
                      </p>
                      <code className="mt-0.5 block font-mono text-sm">{extractedTxnId}</code>
                    </div>
                  )}
                  {extractedUtr && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        UTR on your screenshot
                      </p>
                      <code className="mt-0.5 block font-mono text-sm font-semibold text-foreground">
                        {extractedUtr}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {UTR_BLOCK_COPY[utrBlock].contact && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Still stuck? Contact us:</p>
                  <p>{SUPPORT_EMAIL}</p>
                  <p>{SUPPORT_PHONE}</p>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                {utrBlock === "UTR_IS_TXN_ID" && extractedUtr && (
                  <AlertDialogAction
                    onClick={() => {
                      utrValueRef.current = extractedUtr;
                      setUtrValue(extractedUtr);
                      setUtrBlock(null);
                    }}
                  >
                    Use this UTR
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
