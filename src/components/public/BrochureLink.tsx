import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink, FileText } from "lucide-react";
import React, { PropsWithChildren } from "react";

export type BrochureLinkProps = PropsWithChildren<{
  url?: string | null;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}>;

export function BrochureLink({
  url,
  label = "Brochure",
  variant = "outline",
  size = "sm",
  className,
}: BrochureLinkProps) {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return null;

  return (
    <Button variant={variant} size={size} asChild className={cn("gap-2", className)}>
      <a href={trimmedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
        <FileText className="h-4 w-4" />
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    </Button>
  );
}
