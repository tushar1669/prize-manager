import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from "@/components/ui/sheet";

type PublicHeaderProps = {
  className?: string;
};

const navLinks = [
  { label: "How it works", to: "/how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
] as const;

export function PublicHeader({ className }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className={`sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm ${className ?? ""}`.trim()}>
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-24 items-center justify-between sm:h-28">
          {/* Left: Logo */}
          <div className="flex items-center h-full">
            <Link to="/" aria-label="Go to Prize Manager home" className="flex items-center shrink-0">
              <BrandLogo
                variant="lockup"
                alt="Prize Manager"
                size="xl"
                fetchPriority="high"
                loading="eager"
                decoding="async"
              />
            </Link>
          </div>

          {/* Center: nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: Organizer button + mobile menu */}
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Organizer</Link>
            </Button>

            <div className="md:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-64">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <nav className="mt-10 flex flex-col gap-4">
                    {navLinks.map((link) => (
                      <SheetClose asChild key={link.to}>
                        <Link
                          to={link.to}
                          className="text-base font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                    <SheetClose asChild>
                      <Link
                        to="/auth"
                        className="text-base font-medium text-foreground hover:text-primary transition-colors"
                      >
                        Organizer sign-in
                      </Link>
                    </SheetClose>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
