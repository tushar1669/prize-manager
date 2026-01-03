import { Link } from "react-router-dom";

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-card/95 ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/auth"
            aria-label="Organizer sign in"
            className="text-sm text-zinc-300 hover:text-white underline"
            data-testid="organizer-signin-link"
          >
            Organizer sign in
          </Link>
          <Link to="/" aria-label="Prize-Manager home" className="flex items-center gap-3">
            <img
              src="/brand/prize-manager-logo.png"
              alt="Prize-Manager"
              className="h-8 w-auto max-w-[160px] object-contain shrink-0 sm:h-10 sm:max-w-[200px] md:h-12"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
