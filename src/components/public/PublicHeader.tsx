import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center h-full">
            <Link to="/" aria-label="Go to Prize Manager home" className="flex items-center shrink-0">
              <BrandLogo
                variant="lockup"
                alt="Prize Manager"
                className="h-8 w-auto max-w-[200px] sm:h-9 sm:max-w-[240px] dark:brightness-0 dark:invert"
                fetchPriority="high"
                loading="eager"
                decoding="async"
                opticalOffsetY={1}
              />
            </Link>
          </div>

          {/* Right: Organizer button */}
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Organizer</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
