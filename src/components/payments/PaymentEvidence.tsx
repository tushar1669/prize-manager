import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { getSignedUrl } from "@/lib/storage";
import { formatCurrencyINR } from "@/utils/currency";

/**
 * Shared presentation of payment-screenshot extraction evidence.
 *
 * Used by both master surfaces:
 *  - PendingPaymentsPanel (the review queue — rows leave it once decided)
 *  - AdminPayments "All Payments" (the durable history — where a payment is
 *    investigated weeks later)
 *
 * The two must agree, so the rules live here once:
 *  a. Legible at rest. No readability may depend on hover, and null values are
 *     never dimmed into invisibility.
 *  b. A null payee_vpa is a CAUTION, not a neutral dash — paymentTrustCheck
 *     skips the payee allow-list comparison entirely when the field is falsy,
 *     so null means the invariant never ran.
 *  c. confidence is stored 0–1 and is rendered as Math.round(confidence * 100).
 */

export interface ExtractionPayload {
  amount_inr?: number | null;
  utr?: string | null;
  txn_date?: string | null;
  payee_vpa?: string | null;
  payer_name?: string | null;
  status_text?: string | null;
  app?: string | null;
}

export interface ExtractionFlag {
  field: string;
  reason: string;
  severity: string;
  expected?: number;
  stated?: number;
}

export interface ExtractionDetail {
  payload: ExtractionPayload;
  field_flags: ExtractionFlag[];
  confidence: number;
  file_path: string | null;
}

/** Human-readable expansion of a machine flag reason. */
function flagText(f: ExtractionFlag): string {
  const base = `${f.field.replace(/_/g, " ")}: ${f.reason.replace(/_/g, " ")}`;
  if (f.reason === "amount_mismatch" && f.expected != null && f.stated != null) {
    return `${base} (expected ${formatCurrencyINR(f.expected)}, got ${formatCurrencyINR(f.stated)})`;
  }
  if (f.reason === "date_stale") return `${base} (too old)`;
  return base;
}

/**
 * Shows the uploaded payment screenshot in-app, via a short-lived signed URL.
 *
 * The reviewer stays in the review context: the image opens in a dialog next to
 * the extracted fields it has to be checked against, not in a new tab on a raw
 * storage URL. "Open in new tab" is kept inside the dialog for zooming.
 *
 * Three failure modes, all of which must be VISIBLE — a review screen may never
 * render an empty box:
 *  1. no stored file          → amber notice in place of the button
 *  2. signing fails           → error text under the button
 *  3. the object 404s / is gone → the <img> onError fallback inside the dialog
 *
 * The URL is signed on click and dropped on close, never cached across opens:
 * tokens expire after an hour and a stale one fails silently.
 */
export function ViewScreenshotButton({ filePath }: { filePath: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  if (!filePath) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
        <AlertCircle className="h-3 w-3 shrink-0" />
        No stored file for this extraction — screenshot cannot be shown
      </span>
    );
  }

  // filePath is passed through verbatim: stored rows use more than one path
  // shape and the bucket resolves all of them. Never parse or rebuild it here.
  const open = async () => {
    setLoading(true);
    setError(null);
    setImageFailed(false);
    const { url, error: signError } = await getSignedUrl("extraction-uploads", filePath, 3600);
    setLoading(false);
    if (!url) {
      setError(signError?.message ?? "Could not generate a signed URL for this file.");
      return;
    }
    setSignedUrl(url);
  };

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={open} disabled={loading}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
        View screenshot
      </Button>
      {error && (
        <span className="text-[11px] font-medium text-destructive">Screenshot unavailable: {error}</span>
      )}

      <Dialog
        open={signedUrl != null}
        onOpenChange={(next) => {
          if (!next) {
            setSignedUrl(null);
            setImageFailed(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Payment screenshot</DialogTitle>
            <DialogDescription className="text-xs">
              Check the amount and UTR here against the extracted fields.
              {signedUrl && (
                <>
                  {" "}
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2"
                  >
                    Open in new tab
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>{" "}
                  to zoom.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Payment screenshots are tall phone captures. Scroll the container
              rather than squashing the image below legibility. */}
          <div className="max-h-[75vh] overflow-auto rounded border bg-muted/30">
            {imageFailed ? (
              <div className="flex items-start gap-2 p-4 text-xs font-medium text-destructive">
                <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                <span>
                  Screenshot could not be loaded.
                  <span className="block font-normal">
                    The file is missing from storage or the link has expired. Close this and try
                    again; if it keeps failing, treat this payment as having no screenshot evidence.
                  </span>
                </span>
              </div>
            ) : (
              signedUrl && (
                <img
                  src={signedUrl}
                  alt="Payment screenshot submitted with this claim"
                  className="mx-auto max-h-[80vh] w-auto object-contain"
                  onError={() => setImageFailed(true)}
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}

/**
 * The claim carries no screenshot at all (screenshot_extraction_id is null).
 * Distinct from "screenshot exists but the file is gone" and from a URL failure.
 */
export function NoScreenshotNotice() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-warning">
      <AlertCircle className="h-3 w-3 shrink-0" />
      UTR only — no screenshot
    </span>
  );
}

/**
 * Every extracted field, the confidence, and the full flag list.
 * `claimedAmountInr` (when given) drives the claimed-vs-screenshot comparison.
 */
export function PaymentExtractionEvidence({
  extraction,
  claimedAmountInr,
  showScreenshotAction = true,
}: {
  extraction: ExtractionDetail;
  claimedAmountInr?: number | null;
  showScreenshotAction?: boolean;
}) {
  const flags = extraction.field_flags;
  const hasFlags = flags.length > 0;
  const extractedAmount = extraction.payload.amount_inr ?? null;
  const amountMismatch =
    claimedAmountInr != null && extractedAmount != null && extractedAmount !== claimedAmountInr;

  const payeeVpa = extraction.payload.payee_vpa ?? null;
  const payeeFlagged = flags.some((f) => f.field === "payee_vpa");

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 font-semibold">
          {hasFlags ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0" />
              <span className="text-warning">
                {flags.length} flag{flags.length !== 1 ? "s" : ""} — review before approving
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="text-success">
                Screenshot verified · {Math.round(extraction.confidence * 100)}% confidence
              </span>
            </>
          )}
        </div>
        {showScreenshotAction && <ViewScreenshotButton filePath={extraction.file_path} />}
      </div>

      {/* Amount is spelled out rather than left to the caller's column, so the
          drawer is self-contained evidence when read in isolation. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-foreground/70">Amount on screenshot:</span>
        {extractedAmount != null ? (
          <span
            className={amountMismatch ? "font-semibold text-destructive" : "font-medium text-foreground"}
          >
            {formatCurrencyINR(extractedAmount)}
          </span>
        ) : (
          <span className="font-normal italic text-foreground/70">not found on screenshot</span>
        )}
        {claimedAmountInr != null && (
          <span className="text-foreground/70">
            · claimed <span className="font-medium text-foreground">{formatCurrencyINR(claimedAmountInr)}</span>
          </span>
        )}
        {amountMismatch && (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
            <AlertCircle className="h-3 w-3 shrink-0" />
            Mismatch
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            { label: "Payer name", value: extraction.payload.payer_name ?? null, flagField: "payer_name" },
            { label: "UTR", value: extraction.payload.utr ?? null, flagField: "utr" },
            { label: "Date", value: extraction.payload.txn_date ?? null, flagField: "txn_date" },
            { label: "App", value: extraction.payload.app ?? null, flagField: "app" },
            { label: "Status", value: extraction.payload.status_text ?? null, flagField: "status_text" },
          ] as Array<{ label: string; value: string | null; flagField: string }>
        ).map(({ label, value, flagField }) => {
          const flagged = flags.some((f) => f.field === flagField);
          return (
            <div key={label} className="flex items-baseline gap-1 min-w-0">
              {value != null && !flagged && (
                <CheckCircle2 className="h-2.5 w-2.5 text-success shrink-0 mt-px" />
              )}
              {flagged && (
                <AlertCircle className="h-2.5 w-2.5 text-warning shrink-0 mt-px" />
              )}
              {value == null && !flagged && <span className="inline-block w-2.5 shrink-0" />}
              <span className="shrink-0 font-medium text-foreground/70">{label}:</span>
              <span
                className={[
                  "truncate font-medium",
                  flagged ? "text-warning" : "text-foreground",
                  value == null ? "font-normal italic text-foreground/70" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {value ?? "not found on screenshot"}
              </span>
            </div>
          );
        })}
      </div>

      {/* payee_vpa gets its own line: a null here does NOT mean "checked and
          fine" — paymentTrustCheck skips the VPA comparison entirely when the
          field is falsy. */}
      {payeeVpa == null ? (
        <div className="flex items-start gap-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-1">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-warning mt-px" />
          <span className="font-semibold text-warning">
            Payee VPA: not found on screenshot — NOT VERIFIED
            <span className="block font-normal">
              The payee allow-list check did not run for this payment. Confirm the destination
              account manually before approving.
            </span>
          </span>
        </div>
      ) : (
        <div className="flex items-baseline gap-1 min-w-0">
          {payeeFlagged ? (
            <AlertCircle className="h-2.5 w-2.5 text-warning shrink-0 mt-px" />
          ) : (
            <CheckCircle2 className="h-2.5 w-2.5 text-success shrink-0 mt-px" />
          )}
          <span className="shrink-0 font-medium text-foreground/70">Payee VPA:</span>
          <span
            className={`truncate font-medium ${
              payeeFlagged ? "text-warning" : "text-foreground"
            }`}
          >
            {payeeVpa}
          </span>
        </div>
      )}

      {hasFlags && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {flags.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 bg-warning/15 text-warning border border-warning/30 text-[11px] font-medium leading-tight"
            >
              {flagText(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
