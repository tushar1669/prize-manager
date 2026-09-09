import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Faq() {
  return (
    <>
      <Seo
        title="FAQ | Prize Manager"
        description="Frequently asked questions about Prize Manager: Swiss Manager import, scanned brochures, team prizes, pricing, and payment."
        path="/faq"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-foreground mb-8">FAQ</h1>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="swiss-manager">
                  <AccordionTrigger>Does it work with Swiss Manager?</AccordionTrigger>
                  <AccordionContent>Yes, that is the primary import path.</AccordionContent>
                </AccordionItem>

                <AccordionItem value="scanned-brochure">
                  <AccordionTrigger>What if the brochure is a scan rather than a text PDF?</AccordionTrigger>
                  <AccordionContent>
                    It reads scanned documents; quality depends on the scan, and anything it cannot ground in
                    the source is flagged for review.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="team-prizes">
                  <AccordionTrigger>Can it handle team prizes?</AccordionTrigger>
                  <AccordionContent>
                    Yes — grouped by club, school, city, state, or the Swiss Manager Gr and Type columns, with
                    per-prize team size and a girls minimum. It groups on whichever field carries the
                    institution, so if your file has no school names you would need to supply them.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cost">
                  <AccordionTrigger>How much does it cost?</AccordionTrigger>
                  <AccordionContent>Free up to 150 players, then Rs 500, then Rs 1,000. Per tournament.</AccordionContent>
                </AccordionItem>

                <AccordionItem value="payment">
                  <AccordionTrigger>How do I pay?</AccordionTrigger>
                  <AccordionContent>UPI. No cards, no net banking.</AccordionContent>
                </AccordionItem>

                <AccordionItem value="who-built-it">
                  <AccordionTrigger>Who built it?</AccordionTrigger>
                  <AccordionContent>
                    <Link to="/about" className="text-primary underline underline-offset-2 hover:no-underline">
                      About
                    </Link>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
