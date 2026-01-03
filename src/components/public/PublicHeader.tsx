import { Link } from "react-router-dom";

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  return (
    <header className={`border-b border-border bg-card/95 ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" aria-label="Prize-Manager home" className="flex items-center gap-3">
            <img
              src="/brand/prize-manager-logo-transparent-cropped.png"
              alt="Prize-Manager"
              className="h-7 w-auto max-w-[140px] object-contain shrink-0 sm:h-8 sm:max-w-[180px]"
            />
          </Link>
        </div>
      </div>
    </header>
  );
}
