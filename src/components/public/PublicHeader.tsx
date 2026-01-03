import { useState } from "react";
import { Link } from "react-router-dom";

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Left: Organizer auth CTAs */}
          <div className="flex items-center gap-4">
            <Link
              to="/auth"
              aria-label="Organizer sign in"
              className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
              data-testid="organizer-signin-link"
            >
              Organizer sign in
            </Link>
            <Link
              to="/auth?mode=signup"
              aria-label="Organizer sign up"
              className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
              data-testid="organizer-signup-link"
            >
              Organizer sign up
            </Link>
          </div>

          {/* Right: Logo with cascading fallbacks */}
          <Link to="/" aria-label="Prize-Manager home" className="flex items-center gap-2 shrink-0">
            {imgFailed ? (
              iconFailed ? (
                <span className="text-lg font-bold text-foreground tracking-tight">Prize-Manager</span>
              ) : (
                <>
                  <img
                    src="/brand/prize-manager-icon.png"
                    alt=""
                    className="h-8 sm:h-10 w-auto"
                    onError={() => setIconFailed(true)}
                  />
                  <span className="text-lg font-bold text-foreground tracking-tight">Prize-Manager</span>
                </>
              )
            ) : (
              <img
                src="/brand/prize-manager-logo-transparent-cropped.png"
                alt="Prize-Manager"
                className="h-8 sm:h-10 md:h-12 w-auto max-w-[180px] sm:max-w-[220px] object-contain"
                fetchPriority="high"
                loading="eager"
                decoding="async"
                onError={() => setImgFailed(true)}
              />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
