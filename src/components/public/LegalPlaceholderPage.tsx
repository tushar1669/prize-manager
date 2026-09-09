import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";

type LegalPlaceholderPageProps = {
  heading: string;
  seoTitle: string;
  seoDescription: string;
  path: string;
  documentName: string;
};

const CONTACT_EMAIL = "chess.tushar@gmail.com";

export function LegalPlaceholderPage({ heading, seoTitle, seoDescription, path, documentName }: LegalPlaceholderPageProps) {
  return (
    <>
      <Seo title={seoTitle} description={seoDescription} path={path} noindex />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-foreground mb-6">{heading}</h1>
              <p className="text-muted-foreground">
                Our {documentName} is being finalised with legal counsel and will be published on this page.
                In the meantime, please direct any questions to{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  {CONTACT_EMAIL}
                </a>
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
