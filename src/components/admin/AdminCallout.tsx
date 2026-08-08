import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface AdminCalloutProps {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function AdminCallout({ title, description, ctaLabel, ctaHref }: AdminCalloutProps) {
  return (
    <Alert className="border-warning/30 bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-foreground">{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-muted-foreground">
        <span>{description}</span>
        {ctaLabel && ctaHref ? (
          <div>
            <Button asChild size="sm" variant="outline">
              <a href={ctaHref} target="_blank" rel="noreferrer">
                {ctaLabel}
              </a>
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
