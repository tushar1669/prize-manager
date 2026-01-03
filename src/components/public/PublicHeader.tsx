import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-16 sm:h-18 md:h-20 items-center justify-between py-3">
          {/* Left: Logo */}
          <Link to="/" aria-label="Go to Prize Manager home" className="flex items-center shrink-0">
            {imgFailed ? (
              <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Prize Manager</span>
            ) : (
              <img
                src="/brand/prize-manager-logo-transparent-cropped.png"
                alt="Prize Manager"
                width={240}
                height={64}
                className="h-12 sm:h-14 md:h-16 w-auto object-contain"
                fetchPriority="high"
                loading="eager"
                decoding="async"
                onError={() => setImgFailed(true)}
              />
            )}
          </Link>

          {/* Right: Organizer button */}
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Organizer</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
