import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
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
    body: "Alongside individual awards, group players from this same tournament by school, club, team, city or state; set a counted team size and optional girls minimum, then add separate institution awards.",
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
  const { hash } = useLocation();

  // Native fragment scrolling can run before a lazy-loaded React page mounts.
  useEffect(() => {
    if (hash === "#team-prizes") {
      document.getElementById("team-prizes")?.scrollIntoView();
    }
  }, [hash]);

  return (
    <>
      <Seo
        title="How It Works | Prize Manager"
        description="How Prize Manager works: import tournament standings, configure individual and Team Prizes, review allocation, and publish results. Includes a Team Prizes organizer PDF."
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

              <section
                id="team-prizes"
                aria-labelledby="team-prizes-heading"
                className="mt-12 scroll-mt-32 border-t border-border pt-10"
              >
                <h2 id="team-prizes-heading" className="text-2xl font-bold text-foreground">
                  Team Prizes
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Award Best School, Best Club or other institution prizes without registering separate teams.
                  Players remain in the individual tournament, and may also contribute to a team award.
                  Institution cash prizes, trophies and medals are separate from individual prizes.
                </p>

                <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground marker:font-semibold">
                  <li>
                    <strong>Prepare the final results.</strong> Import players with their final individual Rank,
                    Pts (tournament points) and consistent institution names. The recognized School header
                    imports to the Team field; Club imports to the Club field.
                  </li>
                  <li>
                    <strong>Set the team rules.</strong> In Tournament Setup → Prize Structure → Team Prizes,
                    add a group such as Best School. Choose the matching Group Players By field, Team Size
                    and, if needed, a minimum number of girls recorded explicitly as F.
                  </li>
                  <li>
                    <strong>Add the awards.</strong> Create the group, enter each place's cash, trophy or
                    medal, then select Save Prizes. Saving the group and saving prize rows are separate actions.
                  </li>
                  <li>
                    <strong>Preview and verify.</strong> Run Preview Allocation and review the counted players,
                    their summed Pts, eligibility explanations and any ties against the official standings.
                    Players are selected by best individual Rank, not by highest Pts.
                  </li>
                  <li>
                    <strong>Finalize and publish.</strong> Check the final team and individual results before
                    publishing the tournament. If a tie requires a manual ruling, verify that resolution
                    separately before declaring winners.
                  </li>
                </ol>

                <p className="mt-5 rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
                  <strong>Example:</strong> With Team Size 4, a school's counted players at individual ranks
                  2, 7, 11 and 19 score 7, 6, 5.5 and 5 Pts. Its team score is
                  <strong> 23.5 points</strong>. The ranking sums those four players' tournament points;
                  their ranks determine who is selected and help break equal team scores.
                </p>

                <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">Before allocating:</strong> Check the final Rank,
                  Pts and Group Players By field. Blank or inconsistent institution labels can split or omit
                  teams. An institution currently needs at least Team Size entrants; a separate minimum
                  roster-size setting is not yet available.
                </p>

                <a
                  href="/guides/team-prizes-organizer-guide-2026-10.pdf"
                  download="Prize-Manager-Team-Prizes-Organizer-Guide.pdf"
                  className="mt-6 inline-flex max-w-full items-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Download Team Prizes Organizer Guide (PDF)
                </a>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  18-page illustrated guide. Authentic Resolve Tie and Save Resolution screenshots were not
                  captured or exercised in the guide; their workflow remains unverified by those captures.
                </p>
              </section>

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
