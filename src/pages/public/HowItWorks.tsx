import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";

const steps = [
  {
    title: "Upload the tournament brochure as a PDF",
    body: "The system reads the prize structure out of it.",
  },
  {
    title: "Upload your Swiss Manager player file",
    body: null,
  },
  {
    title: "Set up categories and team prizes",
    body: null,
  },
  {
    title: "Run the allocation and review it",
    body: "Where a prize goes unfilled it records why; for team prizes it names every institution that did not qualify and the rule it missed.",
  },
  {
    title: "Publish a public results page and download the PDF",
    body: null,
  },
] as const;

export default function HowItWorks() {
  return (
    <>
      <Seo
        title="How It Works | Prize Manager"
        description="The Prize Manager flow: upload a brochure and a player file, set up categories, run allocation, and publish results."
        path="/how-it-works"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-foreground mb-8">How it works</h1>
              <ol className="space-y-6">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm font-semibold text-foreground">
                      {i + 1}
                    </span>
                    <div className="pt-0.5">
                      <p className="font-medium text-foreground">{step.title}.</p>
                      {step.body && <p className="text-sm text-muted-foreground mt-1">{step.body}</p>}
                    </div>
                  </li>
                ))}
              </ol>

              <p className="mt-10 text-sm text-muted-foreground">
                See what it costs on the{" "}
                <Link to="/pricing" className="text-primary underline underline-offset-2 hover:no-underline">
                  pricing page
                </Link>
                .
              </p>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
