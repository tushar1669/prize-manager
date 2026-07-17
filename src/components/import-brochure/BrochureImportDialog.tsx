import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadFile } from "@/lib/storage";
import { FileUp, FileWarning, Loader2 } from "lucide-react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
};

/**
 * Extraction runs 30-90s as a single call, so stage transitions are elapsed-time estimates;
 * only "uploading" and the terminal states are real events. Honest enough for a progress feel
 * without pretending the server streams status.
 */
type Stage = "idle" | "uploading" | "reading" | "extracting" | "checking" | "error";

const STAGE_COPY: Record<Exclude<Stage, "idle" | "error">, { label: string; progress: number }> = {
  uploading: { label: "Uploading your brochure…", progress: 15 },
  reading: { label: "Reading the document…", progress: 40 },
  extracting: { label: "Extracting tournament details…", progress: 70 },
  checking: { label: "Verifying every value against the document…", progress: 90 },
};

interface BrochureImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** supabase.functions.invoke surfaces non-2xx as FunctionsHttpError; the body carries our error code. */
async function readFunctionErrorCode(error: unknown): Promise<{ code: string; message: string }> {
  const fallback = { code: "unknown", message: "Something went wrong." };
  if (!error || typeof error !== "object") return fallback;
  const context = (error as { context?: Response }).context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      if (body && typeof body.error === "string") {
        return { code: body.error, message: typeof body.message === "string" ? body.message : "" };
      }
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

function errorCopy(code: string): { title: string; detail: string } {
  if (code === "ocr_empty") {
    return {
      title: "We couldn't read this brochure",
      detail:
        "Some heavily designed brochures resist automatic reading — this is a known limitation, not something you did wrong. Your account is unaffected: continue with manual entry and your tournament setup will work exactly as before.",
    };
  }
  if (code === "file_too_large") {
    return { title: "File too large", detail: "Brochures up to 10MB are supported. Try a compressed PDF." };
  }
  if (code === "provider_rate_limited") {
    return { title: "The reader is busy right now", detail: "Please wait a minute and try again, or continue with manual entry." };
  }
  return {
    title: "Extraction didn't complete",
    detail: "Nothing was saved to your account. You can try again, or continue with manual entry — no work is lost.",
  };
}

export default function BrochureImportDialog({ open, onOpenChange }: BrochureImportDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const stageTimers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    stageTimers.current.forEach((t) => window.clearTimeout(t));
    stageTimers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!open) {
      clearTimers();
      setStage("idle");
      setError(null);
    }
  }, [open, clearTimers]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) return;

      if (!ACCEPTED_TYPES[file.type]) {
        setError({ title: "Unsupported file type", detail: "Upload a PDF, JPEG, PNG, WebP or HEIC brochure." });
        setStage("error");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError({ title: "File too large", detail: "Brochures up to 10MB are supported. Try a compressed PDF." });
        setStage("error");
        return;
      }

      setError(null);
      setStage("uploading");

      try {
        // Storage RLS requires the first path segment to be the uploader's uid.
        const path = `${user.id}/${crypto.randomUUID()}${ACCEPTED_TYPES[file.type]}`;
        const { path: storedPath, error: uploadErr } = await uploadFile("extraction-uploads", path, file);
        if (uploadErr || !storedPath) throw new Error(uploadErr?.message ?? "Upload failed");

        const fileHash = await sha256Hex(file);
        const { data: doc, error: docErr } = await supabase
          .from("extraction_documents")
          .insert({
            uploaded_by: user.id,
            file_name: file.name,
            file_path: storedPath,
            file_hash: fileHash,
            file_size_bytes: file.size,
            mime_type: file.type,
            doc_type: "chess_brochure",
            privacy_class: "public",
            status: "pending",
          })
          .select("id")
          .single();
        if (docErr || !doc) throw new Error(docErr?.message ?? "Could not register the document");

        setStage("reading");
        stageTimers.current.push(window.setTimeout(() => setStage("extracting"), 20_000));
        stageTimers.current.push(window.setTimeout(() => setStage("checking"), 45_000));

        // invoke() sends the user's session JWT; the extract gateway requires it.
        const { data, error: fnError } = await supabase.functions.invoke("extract", {
          body: { document_id: doc.id },
        });
        clearTimers();

        if (fnError) {
          const { code } = await readFunctionErrorCode(fnError);
          setError(errorCopy(code));
          setStage("error");
          return;
        }

        const extractionId = typeof data?.extraction_id === "string" ? data.extraction_id : null;
        if (!extractionId) {
          setError(errorCopy("unknown"));
          setStage("error");
          return;
        }

        onOpenChange(false);
        navigate(`/import/brochure/${extractionId}`);
      } catch (err) {
        clearTimers();
        setError({
          title: "Extraction didn't complete",
          detail: err instanceof Error && err.message.includes("row-level security")
            ? "Your account doesn't have permission to upload brochures."
            : "Nothing was saved to your account. You can try again, or continue with manual entry — no work is lost.",
        });
        setStage("error");
      }
    },
    [user, navigate, onOpenChange, clearTimers],
  );

  const busy = stage !== "idle" && stage !== "error";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import from brochure</DialogTitle>
          <DialogDescription>
            Upload your tournament brochure and we'll extract the details, categories and prizes
            for you to review. Nothing is saved until you approve it.
          </DialogDescription>
        </DialogHeader>

        {stage === "idle" && (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-primary/50">
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              PDF, JPEG, PNG, WebP or HEIC — up to 10MB
            </span>
            <input
              type="file"
              className="hidden"
              accept={Object.keys(ACCEPTED_TYPES).join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button variant="secondary" size="sm" className="pointer-events-none">
              Choose file
            </Button>
          </label>
        )}

        {busy && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">{STAGE_COPY[stage as keyof typeof STAGE_COPY].label}</span>
            </div>
            <Progress value={STAGE_COPY[stage as keyof typeof STAGE_COPY].progress} />
            <p className="text-xs text-muted-foreground">
              This usually takes 30–90 seconds. Keep this window open.
            </p>
          </div>
        )}

        {stage === "error" && error && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-medium">{error.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{error.detail}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStage("idle")}>
                Try another file
              </Button>
              <Button onClick={() => onOpenChange(false)}>Continue with manual entry</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
