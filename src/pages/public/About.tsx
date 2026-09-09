import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";

export default function About() {
  return (
    <>
      <Seo
        title="About | Prize Manager"
        description="About the person behind Prize Manager: Senior National Arbiter and National Instructor, General Secretary of the Varanasi Chess Association."
        path="/about"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto space-y-8">
              <h1 className="text-3xl font-bold text-foreground">About</h1>

              {/* TODO: About narrative — owner-supplied copy, not model-drafted */}

              <ul className="space-y-3">
                <li className="flex gap-3 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <span>Senior National Arbiter and National Instructor</span>
                </li>
                <li className="flex gap-3 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <span>
                    <a
                      href="https://ratings.fide.com/profile/25022288"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      FIDE profile (FIDE ID 25022288)
                    </a>
                  </span>
                </li>
                <li className="flex gap-3 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <span>General Secretary, Varanasi Chess Association</span>
                </li>
                <li className="flex gap-3 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <span>
                    Captain, Tech Mahindra chess team, FIDE World Corporate Chess Championship 2025, Goa
                  </span>
                </li>
                <li className="flex gap-3 text-sm text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
                  <span>
                    Also builds{" "}
                    <a
                      href="https://sportup.online"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      sportup.online
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://certificate-hub.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      certificate-hub.com
                    </a>
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
