import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import React, { PropsWithChildren, useState, useEffect } from "react";
import { getSignedUrl } from "@/lib/storage";

export type BrochureLinkProps = PropsWithChildren<{
  url?: string | null;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}>;

/**
 * Detects if a URL is a storage path (needs signed URL) vs a full URL
 * Storage paths don't start with http/https
 */
function isStoragePath(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}

export function BrochureLink({
  url,
  label = "Brochure",
  variant = "outline",
  size = "sm",
  className,
}: BrochureLinkProps) {
  const trimmedUrl = url?.trim();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trimmedUrl) {
      setSignedUrl(null);
      return;
    }

    // If it's already a full URL, use it directly
    if (!isStoragePath(trimmedUrl)) {
      setSignedUrl(trimmedUrl);
      return;
    }

    // It's a storage path - generate signed URL
    let cancelled = false;
    setLoading(true);
    
    getSignedUrl("brochures", trimmedUrl).then(({ url: signed, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        console.error("[BrochureLink] Failed to get signed URL:", error);
        setSignedUrl(null);
      } else {
        setSignedUrl(signed);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [trimmedUrl]);

  // Don't render if no URL provided
  if (!trimmedUrl) return null;

  // Show loading state while fetching signed URL
  if (loading) {
    return (
      <Button variant={variant} size={size} disabled className={cn("gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </Button>
    );
  }

  // Don't render if signed URL failed
  if (!signedUrl) return null;

  return (
    <Button variant={variant} size={size} asChild className={cn("gap-2", className)}>
      <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    </Button>
  );
}
