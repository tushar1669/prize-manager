import { Link } from "react-router-dom";
import { Linkedin, Instagram, Facebook, Youtube, Twitter } from "lucide-react";

export const socialLinks = [
  { label: "LinkedIn", href: "https://www.linkedin.com/in/tusharsaraswat/", Icon: Linkedin },
  { label: "X", href: "https://x.com/tusharsaraswat_", Icon: Twitter },
  { label: "Instagram", href: "https://www.instagram.com/tusharsaraswat_", Icon: Instagram },
  { label: "Facebook", href: "https://www.facebook.com/tushar1669", Icon: Facebook },
  { label: "YouTube", href: "https://www.youtube.com/@tusharsaraswat", Icon: Youtube },
] as const;

const productLinks = [
  { label: "How it works", to: "/how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "Results", to: "/public" },
] as const;

const companyLinks = [
  { label: "About", to: "/about" },
  { label: "FAQ", to: "/faq" },
  { label: "Contact", to: "/contact" },
] as const;

const legalLinks = [
  { label: "Terms", to: "/terms" },
  { label: "Privacy", to: "/privacy" },
  { label: "Refunds", to: "/refund" },
] as const;

function FooterColumn({ heading, links }: { heading: string; links: readonly { label: string; to: string }[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="space-y-4 md:col-span-2">
            <div className="text-lg font-semibold text-foreground">Prize Manager</div>
            <p className="text-sm text-muted-foreground max-w-sm">
              Prize allocation for chess tournament organizers in India.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <FooterColumn heading="Product" links={productLinks} />
          <FooterColumn heading="Company" links={companyLinks} />
          <FooterColumn heading="Legal" links={legalLinks} />
        </div>

        <div className="mt-10 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {/* TODO: fill in the legal entity name once counsel confirms it */}
            © 2026 [LEGAL ENTITY NAME] · Public beta
          </p>
          <a href="mailto:chess.tushar@gmail.com" className="hover:text-foreground transition-colors">
            chess.tushar@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
