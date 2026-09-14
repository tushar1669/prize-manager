import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Terms of Service - prize-manager.com
 *
 * DRAFTED BY EXTERNAL LEGAL COUNSEL. Transcribed programmatically from the
 * supplied document. No clause has been written, summarised, paraphrased or
 * edited by any model or by hand.
 *
 * Placeholders counsel left, resolved on owner instruction:
 *   [Entity Name]    -> DERA Tech
 *   [7] days         -> 15 days (Clause 16.2)
 *   [Postal address] -> Grievance Officer address, Varanasi 221107
 *
 * NOTE: the Privacy Notice and Refund Policy referenced throughout have not
 * yet been supplied by counsel. /privacy and /refund remain placeholder
 * notices until they are.
 */
export default function Terms() {
  return (
    <>
      <Seo
        title="Terms of Service | Prize Manager"
        description="Terms of Service for prize-manager.com, operated by DERA Tech."
        path="/terms"
      />
      <div className="min-h-screen flex flex-col bg-background">
        <PublicHeader />
        <main className="flex-1 container mx-auto px-4 sm:px-6 py-10 max-w-3xl">
          <h1 className="text-2xl font-medium mb-2">Terms of Service</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Operated by DERA Tech for prize-manager.com.
          </p>

          <nav aria-label="Contents" className="mb-10 rounded-lg border border-border p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contents</p>
            <ol className="space-y-1 text-sm">
          <li><a href="#introduction-and-acceptance" className="text-muted-foreground hover:text-foreground">Introduction and Acceptance</a></li>
          <li><a href="#definitions" className="text-muted-foreground hover:text-foreground">Definitions</a></li>
          <li><a href="#description-of-services" className="text-muted-foreground hover:text-foreground">4. Description of Services</a></li>
          <li><a href="#tournament-data-organiser-responsibilities" className="text-muted-foreground hover:text-foreground">5. Tournament Data &amp; Organiser Responsibilities</a></li>
          <li><a href="#processing-and-publication-of-tournament-results" className="text-muted-foreground hover:text-foreground">6. Processing and Publication of Tournament Results</a></li>
          <li><a href="#prize-calculations-and-disclaimer" className="text-muted-foreground hover:text-foreground">7. Prize Calculations and Disclaimer</a></li>
          <li><a href="#pricing-plans-coupons" className="text-muted-foreground hover:text-foreground">8. Pricing, Plans &amp; Coupons</a></li>
          <li><a href="#payments-and-payment-gateway" className="text-muted-foreground hover:text-foreground">9. Payments and Payment Gateway</a></li>
          <li><a href="#refunds-cancellations" className="text-muted-foreground hover:text-foreground">10. Refunds &amp; Cancellations</a></li>
          <li><a href="#intellectual-property" className="text-muted-foreground hover:text-foreground">11. Intellectual Property</a></li>
          <li><a href="#user-contentlicence" className="text-muted-foreground hover:text-foreground">12. User Content/Licence</a></li>
          <li><a href="#prohibited-uses" className="text-muted-foreground hover:text-foreground">13. Prohibited Uses</a></li>
          <li><a href="#thirdparty-services" className="text-muted-foreground hover:text-foreground">14. Third-Party Services</a></li>
          <li><a href="#privacy-data-protection" className="text-muted-foreground hover:text-foreground">15. Privacy &amp; Data Protection</a></li>
          <li><a href="#availability-modifications-suspension" className="text-muted-foreground hover:text-foreground">16. Availability, Modifications &amp; Suspension</a></li>
          <li><a href="#disclaimers" className="text-muted-foreground hover:text-foreground">17. Disclaimers</a></li>
          <li><a href="#limitation-of-liability" className="text-muted-foreground hover:text-foreground">18. Limitation of Liability</a></li>
          <li><a href="#indemnity" className="text-muted-foreground hover:text-foreground">19. Indemnity</a></li>
          <li><a href="#termination" className="text-muted-foreground hover:text-foreground">20. Termination</a></li>
          <li><a href="#grievance-redressal" className="text-muted-foreground hover:text-foreground">21. Grievance Redressal</a></li>
          <li><a href="#governing-law-jurisdiction" className="text-muted-foreground hover:text-foreground">22. Governing Law &amp; Jurisdiction</a></li>
          <li><a href="#general-provisions" className="text-muted-foreground hover:text-foreground">23. General Provisions</a></li>
          <li><a href="#schedule-a-data-responsibility-matrix" className="text-muted-foreground hover:text-foreground">A. Schedule A - Data Responsibility Matrix</a></li>
          <li><a href="#schedule-b-player-data-fields-publication-status" className="text-muted-foreground hover:text-foreground">B. Schedule B - Player Data Fields &amp; Publication Status</a></li>
          <li><a href="#schedule-c-uploadtime-parental-consent-attestation" className="text-muted-foreground hover:text-foreground">C. Schedule C - Upload-Time Parental Consent Attestation</a></li>
            </ol>
          </nav>

      <h2 id="introduction-and-acceptance" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">Introduction and Acceptance</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms of Service (“Terms”) are entered into by and between DERA Tech, a body corporate incorporated under the applicable laws of India and operating the website and software platform available at <strong>prize-manager.com</strong> (the “Platform” or “Service”), and the person or entity accessing or using the Platform (the “User”, “you” or “your”). The Platform is made available to tournament organisers and other users subject to these Terms.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms of Service, together with the Privacy Notice, the Refund Policy, and any Schedules attached to or referenced in this document (together, the <strong>"Terms"</strong>), constitute a legally binding agreement between the Business and any person or entity that creates an account, uploads data, or otherwise uses the Service (<strong>"Organiser"</strong>, <strong>"you"</strong>, <strong>"your"</strong>). Where the Terms as they relate to the processing of Player Data are concerned, this document also operates as the data processing/allocation-of-responsibility terms as between the Business and the Organiser, in place of a separate data processing agreement, as recorded in Clauses 5, 6, and Schedule A.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">By creating an account, clicking "I Agree" or an equivalent affirmative action, uploading a tournament brochure or player file, or otherwise using the Service, you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must not use the Service.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms apply only to your use of prize-manager.com.</p>
      <h2 id="definitions" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">Definitions</h2>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Account"</strong> means the registered organiser account through which a person or entity accesses the Service.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Brochure"</strong> means the tournament information bulletin, prospectus, or similar document (typically a PDF) uploaded by an Organiser, from which the Service extracts the prize structure.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Data Principal"</strong>, <strong>"Data Fiduciary"</strong>, <strong>"Data Processor"</strong>, and <strong>"personal data breach"</strong> have the meanings given to them under the Digital Personal Data Protection Act, 2023 ("<strong>DPDP Act</strong>") and rules made thereunder ("<strong>DPDP Rules</strong>"), as in force or as subsequently amended.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Child"</strong> or <strong>"Minor"</strong> means an individual who has not completed the age of eighteen years, as defined under the DPDP Act.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Organiser"</strong> means the individual or entity that registers an Account to organise, administer, or manage a Tournament through the Service, including any employee, volunteer, or representative acting on that individual's or entity's behalf.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Parent"</strong> means, in relation to a Child, a parent or lawful guardian of that Child, consistent with the meaning of "lawful guardian" under the DPDP Act.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Platform" / "Service"</strong> means the software, website, and related infrastructure made available at prize-manager.com, including brochure parsing, prize-structure extraction, player-file ingestion, allocation computation, and publication of Results.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Player"</strong> means an individual chess player whose Player Data is uploaded to the Service in connection with a Tournament, irrespective of whether that individual is a Data Principal who is an adult or a Child.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Player Data"</strong> means personal data relating to a Player uploaded to, or generated by, the Service, including without limitation name, date of birth, sex, FIDE rating, FIDE ID, federation, school, club, and city/state, and any prize or result computed in relation to that Player.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Player File"</strong> means the export (typically from Swiss-Manager or equivalent pairing software) containing Player Data for a Tournament, uploaded by an Organiser.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Results"</strong> or <strong>"Results Page"</strong> means the public webpage(s) and downloadable PDF(s) generated by the Service showing prize allocations for a Tournament.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"Tournament"</strong> means the chess event administered by an Organiser in respect of which a Brochure and Player File are uploaded to the Service.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>"UPI"</strong> means the Unified Payments Interface operated under the auspices of the National Payments Corporation of India.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; <strong>Eligibility &amp; Account Registration</strong></p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">3.1 Who may register</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">An Account may only be created by an individual who is at least eighteen (18) years old and competent to contract under the Indian Contract Act, 1872, acting either in their personal capacity or on behalf of an organisation, club, federation, school, or association (an <strong>"</strong>Organising Body<strong>"</strong>) that they are authorised to bind.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">3.2 Authority to bind an organisation</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where an Account is created, or a Tournament is administered, on behalf of an Organising Body, the individual creating the Account represents and warrants that they have the actual authority of that Organising Body to (a) enter into these Terms on its behalf, (b) upload Player Data in connection with its Tournaments, and (c) make the representations regarding parental consent set out in Clause 5. The Business is entitled to rely on this representation without further enquiry, and the individual and the Organising Body shall be jointly and severally liable for any breach of these Terms arising from a Tournament administered under that Account.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">3.3 Account security</h3>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">1. You are solely responsible for maintaining the confidentiality of your Account credentials and for all activity that occurs under your Account, whether or not authorised by you.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">2. You must notify us immediately at <strong>chess.tushar@gmail.com</strong> upon becoming aware of any unauthorised access to, or use of, your Account.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">3. We are not liable for any loss or damage arising from your failure to safeguard your credentials, save to the extent such loss arises from our gross negligence or wilful default.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">4. You must provide accurate, current, and complete information when registering and keep such information up to date.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">3.4 Account Management</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Each User shall maintain only such Accounts as are reasonably necessary for the use of the Service. An Organiser shall not create multiple Accounts for the purpose of circumventing applicable usage limits, pricing, restrictions, suspensions or other provisions of these Terms. The Business may, at its discretion, restrict, consolidate or suspend duplicate or improperly created Accounts.</p>
      <h2 id="description-of-services" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">4. Description of Services</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Service allows an Organiser to:</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">1. upload a Tournament Brochure as a PDF, from which the Service extracts the prize structure using automated (including AI-assisted) document parsing;</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">2. upload a Player File (typically a Swiss-Manager export) containing Player Data for the Tournament;</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">3. configure prize categories, eligibility rules, and team/institutional prizes;</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">4. run an automated allocation of prizes against the extracted prize structure and uploaded Player Data, and review the computed allocation before publication. Where a configured prize goes unfilled, the Service records the reason; for team or institutional prizes, the Service identifies every institution that did not qualify and the specific rule it failed to meet; and</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">5. publish a public, unauthenticated Results Page for the Tournament and download a PDF of the Results.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Service is a computational and publication tool. It does not verify the accuracy of information contained in a Brochure or Player File, does not verify a Player's identity, age, rating, or eligibility for any prize beyond what is computed from the data supplied, and does not adjudicate disputes concerning tournament conduct, pairings, or results generated outside the Service. The Organiser remains the tournament authority for all such purposes.</p>
      <h2 id="tournament-data-organiser-responsibilities" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">5. Tournament Data &amp; Organiser Responsibilities</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.1 Source and accuracy of data</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">All Brochures and Player Files are uploaded by, and remain the responsibility of, the Organiser. The Business does not collect Player Data directly from Players or their Parents, and has no relationship with, and no means of independently contacting or verifying, any Player or Parent except through the Organiser. The Organiser represents and warrants that all Player Data it uploads is accurate, is lawfully obtained, and is uploaded for the sole purpose of administering the relevant Tournament through the Service.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.2 Organiser's lawful-basis and notice obligations</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Before uploading Player Data to the Service, the Organiser shall:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">(a) inform each Player (or, for a Child, the Child's Parent) that the Player's personal data will be uploaded to, and processed by, a third-party platform (Prize Manager) for the purpose of prize computation and publication of Results on a public, unauthenticated webpage, in accordance with Clause 6.3; and</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">(b) obtain and maintain such consents, permissions, and other lawful bases as are required under applicable law for its collection of Player Data and its disclosure of that Player Data to the Business, and shall provide such evidence of the same as the Business may reasonably require from time to time.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">This Clause 5.2 states the Organiser's own obligations as the party that collects Player Data from Players and Parents. It allocates responsibility for that collection activity as between the Organiser and the Business; it does not, by itself, determine or limit any obligation the Business may separately owe as a matter of law in respect of its own processing of Player Data, which is addressed in Clause 6.1 and Schedule A.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.3 Business's evidentiary requirement for Child Player Data</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where, and to the extent that, applicable law requires verifiable consent from a Parent before Child Player Data may be processed or published by the Business, the Business may require the Organiser to produce evidence of such consent, and may decline to permit upload, computation, or publication of the relevant Child Player Data until satisfactory evidence (which may include the attestation described in Clause 5.4) is provided. This Clause 5.3 is a contractual condition on the Organiser's use of the Service; it is a risk-management measure for the Business and is not, by itself, a statement that it discharges any separate statutory obligation the Business may have as a Data Fiduciary.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.4 Mandatory upload-time attestation</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">At the point of uploading a Player File, the Service will require the Organiser to affirmatively check a box confirming a statement in substantially the form set out in Schedule C, which the Organiser may not bypass or disable. This attestation is a record for the purposes of Clauses 5.2 and 5.3 and Schedule A, and is not a substitute for the Organiser actually obtaining and being able to evidence parental consent or other lawful basis under Clause 5.2. A false attestation is a material breach of these Terms.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.5 Organiser's responsibility for, and licence to use, Player Data</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">As between the Organiser and the Business, the Organiser remains responsible for the Player Data it uploads and represents that it has the necessary rights, authority, and lawful basis under Clause 5.2 to provide such data to the Business. The Organiser grants the Business a non-exclusive, worldwide, royalty-free licence to host, process, compute, and publish that Player Data solely: (a) to provide the Service to that Organiser; (b) to generate and publish the Results Page and PDF for the relevant Tournament, in accordance with Clause 6; and (c) as otherwise permitted under Clause 15 (Privacy &amp; Data Protection) and Schedule A.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">5.6 Corrections and takedown requests routed through the Organiser</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Because the Business has no direct relationship with Players or Parents, requests to correct, restrict, or erase Player Data, or to object to publication, received directly by the Business from a Player or Parent will, where reasonably possible, be verified and actioned by the Business in accordance with Clause 6.6 and Clause 15, but the Business may also refer such requests to the relevant Organiser for verification of the requestor's identity and standing to make the request, where doing so is reasonably necessary to protect against fraudulent or unauthorised requests.</p>
      <h2 id="processing-and-publication-of-tournament-results" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">6. Processing and Publication of Tournament Results</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.1 Role and allocation of responsibilities.</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The parties acknowledge that the respective roles and obligations of the Business and the Organiser in relation to Player Data, including whether either or both of them is a Data Fiduciary, depend upon the nature and purpose of the relevant processing activity and applicable law. Without prejudice to that determination, the parties' respective responsibilities for specific activities are set out in Schedule A, subject in all cases to applicable law and the Business's Privacy Notice.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.2 Notice to Players/Parents</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">In addition to the notice the Organiser is required to give under Clause 5.2, the Business will make available, on the Results Page and at the point Player Data is first published, a clear and accessible notice describing: what Player Data is published; the purpose of publication; how a Player or Parent can request correction or removal; and how to contact the Business's Grievance Officer under Clause 21.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.3 What is published - minimisation</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">On any public, unauthenticated Results Page or downloadable Results PDF, the Business will publish, for each Player who appears in a prize allocation, only: (a) the Player's name; (b) the Player's school or club (where supplied); and (c) the applicable prize category label (e.g. "Under-9 Girls", "Best Unrated") and the prize won. The Business will not publish a Player's exact date of birth, calculated age, sex, FIDE ID, federation, city/state, or any other Player Data field beyond what is listed in this Clause, even where such fields are present in the underlying Player File, unless the Organiser separately configures and is independently responsible for additional public disclosures outside the Service. Category labels that are themselves age-banded (e.g. an "Under-9" category name) are treated as part of the prize/competition structure, not as disclosure of the Player's individual date of birth or exact age.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.4 Retention of published Results</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Results Pages remain published for so long as is reasonably necessary to serve their purpose as a tournament record, or until removed under Clause 6.6, Clause 15, or the retention schedule notified in the Privacy Notice, whichever is earlier.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.5 Non-public data</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Player Data fields not published under Clause 6.3 (including date of birth, FIDE ID, federation, and city/state) are retained by the Business solely for computation, verification, and support purposes, and are not made available on any public or unauthenticated page.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.6 Correction and removal requests</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">A Player, or a Parent acting for a Child, may request correction or removal of Player Data appearing on a Results Page by writing to <strong>chess.tushar@gmail.com</strong>. The Business will take reasonable steps to verify the request (which may include contacting the relevant Organiser) and will act on verified requests within the timelines set out in the Privacy Notice, and in any event within the timelines prescribed under the DPDP Act and Rules once those provisions take effect.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">6.7 No guarantee of accuracy</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Results are computed strictly from the Brochure and Player File as uploaded by the Organiser. The Business does not independently verify ratings, ages, eligibility, or institutional affiliations. See Clause 7 (Prize Calculations and Disclaimer) and Clause 17 (Disclaimers).</p>
      <h2 id="prize-calculations-and-disclaimer" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">7. Prize Calculations and Disclaimer</h2>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">7. 1. Prize allocations are generated automatically by applying the prize structure extracted from the Brochure to the Player Data in the Player File, together with any categories and rules configured by the Organiser.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">7. 2. The Business does not guarantee that the extraction of the prize structure from a Brochure (including where performed with AI assistance) is complete or error-free, and the Organiser is responsible for reviewing the extracted prize structure and the computed allocation before publication.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">7. 3. Where a configured prize is not awarded, or a team/institutional prize is not awarded to a given institution, the Service will record the reason and, for team prizes, the specific eligibility rule that was not met. This is a computational output based on the data supplied and configured rules; it is not a ruling, finding, or arbitral determination, and confers no legal rights or obligations beyond the operation of the Service itself.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">7. 4. The Organiser, and not the Business, is responsible for the final approval and publication of Results, for resolving any dispute a Player, Parent, club, or federation raises about a prize allocation, and for any prize-distribution obligation arising under the Tournament's own rules or Brochure.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">7. 5. The Business is not a party to, and assumes no liability arising from, the underlying Tournament, its conduct, its prize fund, or any dispute concerning eligibility, pairings, or results generated outside the Service.</p>
      <h2 id="pricing-plans-coupons" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">8. Pricing, Plans &amp; Coupons</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">8.1 Current pricing</h3>
      <Table className="mb-3">
        <TableHeader>
          <TableRow>
            <TableHead>Tournament size (players)</TableHead>
            <TableHead>Fee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-sm text-muted-foreground">
          <TableRow>
            <TableCell>Up to 150 players</TableCell>
            <TableCell>Free</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>151 – 500 players</TableCell>
            <TableCell>₹500 per Tournament</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Above 500 players</TableCell>
            <TableCell>₹1,000 per Tournament</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Pricing is charged per Tournament (based on the number of Players in the uploaded Player File at the time of computation), not as a recurring subscription, unless stated otherwise on the Platform. The Business may change pricing prospectively at any time by posting updated pricing on the Platform; changes will not affect a Tournament for which payment has already been made and features unlocked.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">8.2 Coupons and discounts</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business may, at its discretion, offer coupons or discounts, including a free coupon at sign-up, a profile-completion discount, and referral-scheme credits. Coupons are subject to such conditions, expiry, and usage limits as stated at the time they are offered, may be withdrawn or modified prospectively at any time, have no cash value, are non-transferable unless expressly stated, and may be revoked where obtained through fraud, abuse, or violation of these Terms, without prejudice to any Tournament or feature already unlocked in good faith reliance on the coupon before revocation.</p>
      <h2 id="payments-and-payment-gateway" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">9. Payments and Payment Gateway</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.1 Payment methods</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business will notify, on the Platform at the time of purchase, the payment method(s) available for a given transaction (each a <strong>"Payment Method"</strong>). As at the date of these Terms, the only Payment Method available is direct bank transfer via UPI to a VPA designated by the Business on the Platform, verified manually and by automated matching as described in Clause 9.2. The Business may, in the future, enable additional Payment Methods, including automated payment aggregators or gateways operated by third-party payment service providers which may be regulated by the Reserve Bank of India or other applicable authority depending on the provider. Where the Business does so, this Clause 9 will apply to such Payment Methods as well, the payment transaction may also be subject to the terms and conditions of the relevant payment service provider, which will be made available or linked at the relevant payment interface, and Clause 9.2 (which describes the present manual-verification UPI flow) will apply only for so long as, and to the extent that, payment continues to be taken by that method.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.2 Current process - direct UPI transfer</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where payment is made by direct UPI transfer, the following process applies:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">a.	the Organiser elects to purchase a paid feature or tier and is shown the VPA designated by the Business and the amount payable;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">b. 	the Organiser makes payment via UPI directly to that VPA from a UPI-enabled account or application of the Organiser's choice;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">c. 	the Organiser uploads, through the Platform, a screenshot of the payment confirmation and the Unique Transaction Reference (UTR) number for that payment;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">d. 	the Service checks the amount paid, the payee (VPA) shown, and the UTR against the payment screenshot and, where available, other transaction data; and</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">e. 	where all checks match, the corresponding paid feature is unlocked automatically; where they do not match, or verification is inconclusive, the transaction is held for manual review and approval by the Business before any feature is unlocked.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.3 Organiser responsibilities for UPI payments</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">a. 	The Organiser is solely responsible for ensuring that payment is made to the correct VPA designated by the Business at the time of payment, for the exact amount payable, and for uploading an accurate screenshot and UTR.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">b. 	The Business is not responsible for any payment made to an incorrect VPA, including a VPA obtained from a source other than the Platform (such as a phishing message or a third party impersonating the Business), and strongly recommends that Organisers verify the VPA displayed on the Platform before making payment.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">c. 	Manual review under Clause 9.2(e) may take a reasonable period to complete; the Business will endeavour to complete review within the timelines stated on the Platform.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.4 Taxes</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Fees stated on the Platform are exclusive of applicable taxes unless stated otherwise. Where the Business is or becomes required to collect Goods and Services Tax (GST) or any other tax or levy on fees charged, such tax will be added to, and payable in addition to, the stated fee, and the Business will provide such tax invoice or equivalent document as is then required by law.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.5 No storage of payment credentials</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business does not collect or store UPI PINs, card numbers, CVVs, net-banking credentials, or other payment authentication credentials. Payment screenshots and UTRs are retained solely for verification, accounting, dispute-resolution, and legal/tax record-keeping purposes, in accordance with the Privacy Notice.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">9.6 Chargebacks and payment disputes</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where a payment is reversed, charged back, disputed, or otherwise withdrawn, the Business may suspend or withdraw the relevant paid feature and/or recover any amount thereby legitimately due, subject to applicable law and the relevant payment provider's rules.</p>
      <h2 id="refunds-cancellations" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">10. Refunds &amp; Cancellations</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">10.1 General position</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Except as expressly provided in the Refund Policy or this Clause 10, or as required under applicable law, fees paid are generally non-refundable once the corresponding feature has been made available because the corresponding feature (including automated allocation computation and publication tooling) is made available to the Organiser upon successful verification of payment.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">10.2 Discretionary refunds</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Notwithstanding Clause 10.1, the Business may, in its sole discretion, approve a full or partial refund where, for example: (a) a duplicate or erroneous payment was made; (b) a payment was verified and a feature unlocked in error; (c) the Service was unavailable in a manner that prevented use of the purchased feature for the relevant Tournament and no reasonable workaround was offered; or (d) the Business otherwise determines, acting reasonably, that a refund is warranted. A request for a refund does not, by itself, entitle the Organiser to one.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">10.3 Manual reversal - no automated refund rail</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Because payment is presently taken by direct UPI transfer and not through an automated payment gateway, there is no mechanism for an automated reversal of payment. Where a refund is approved under Clause 10.2, it will be made by a manual bank transfer or UPI transfer by the Business to a bank account or UPI VPA held in the same name as the Organiser (or payer) who made the original payment, within such reasonable period as is notified to the Organiser at the time of approval. The Organiser must provide accurate account or VPA details for this purpose; the Business is not responsible for delay or failure caused by incorrect details supplied by the Organiser.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">10.4 Future automated Payment Methods</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where a refund arises in connection with a payment made through an automated Payment Method enabled under Clause 9.1, the refund will, to the extent supported by that Payment Method's provider, be processed through that provider's standard reversal mechanism to the original payment instrument, and the timelines and process of that provider (as notified on the Platform) will apply instead of Clause 10.3.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">10.5 Cancellation</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Because fees are charged per Tournament for features that are typically consumed at or shortly after purchase, there is no separate subscription-cancellation mechanism. An Organiser may simply choose not to purchase further paid features for future Tournaments.</p>
      <h2 id="intellectual-property" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">11. Intellectual Property</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Service, including its software, source code, algorithms, allocation logic, user interface, design, and the "Prize Manager" name and any associated logos, is the property of the Business and/or its licensors and is protected by applicable intellectual property laws. Nothing in these Terms transfers any ownership in the Service to the Organiser. Subject to these Terms, the Business grants the Organiser a limited, non-exclusive, non-transferable, revocable licence to access and use the Service for its intended purpose.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Results Pages and PDFs generated by the Service in respect of a specific Tournament may be used, shared, and reproduced by the relevant Organiser for purposes connected with that Tournament, including attribution that the allocation was computed using Prize Manager.</p>
      <h2 id="user-contentlicence" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">12. User Content/Licence</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground"><strong>"User Content"</strong> means the Brochure, Player File, category and rule configurations, and any other material uploaded to the Service by an Organiser, other than Player Data (which is separately addressed in Clauses 5 and 6 and Schedule A).</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Organiser retains ownership of its User Content and warrants that it has all rights necessary to upload it and to grant the licence in this Clause. The Organiser grants the Business a non-exclusive, worldwide, royalty-free licence to host, reproduce, and process User Content solely to provide the Service, including using automated tools (which may include third-party AI services, as described in Clause 14) to extract the prize structure from a Brochure. The Business will not use Brochure content for any purpose other than providing the Service to the Organiser that uploaded it, except in de-identified, aggregated form for product improvement, analytics, or the purposes described in the Privacy Notice.</p>
      <h2 id="prohibited-uses" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">13. Prohibited Uses</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">You must not, and must not permit any third party to:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	upload Player Data for which the notice and consent obligations in Clause 5.3 have not been satisfied, or make a false attestation under Clause 5.4;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	upload any Brochure or Player File containing data you are not lawfully entitled to upload, or that infringes the rights of any third party;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	use the Service to publish false, misleading, or defamatory prize results;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	attempt to gain unauthorised access to the Service, other Accounts, or any system or network connected to the Service;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	reverse-engineer, decompile, or attempt to extract the source code or underlying algorithms of the Service, except to the extent such restriction is not permitted by applicable law;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	use the Service to scrape, harvest, or systematically extract Player Data displayed on Results Pages for any purpose other than the individual's own reference;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	interfere with, disrupt, or place an unreasonable load on the Service's infrastructure; or</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	use the Service for any unlawful purpose or in violation of any applicable law, including data protection law.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business may investigate suspected violations and take action under Clause 16 and Clause 20, including suspension or termination of the relevant Account, without prejudice to any other right or remedy.</p>
      <h2 id="thirdparty-services" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">14. Third-Party Services</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Service uses third-party infrastructure providers, subprocessors, and service providers to provide and maintain the Service, including for hosting, transactional email, and automated document processing. The categories of provider used, the categories of data (if any) shared with each, and the location(s) at which data is processed are set out in the Privacy Notice, which the Business will keep updated as providers change. As at the date of these Terms, the Business's automated document-processing provider (used to assist in extracting the prize structure from an uploaded Brochure) does not receive Player Data or payment data (including payment screenshots and UTRs); only Brochure content is shared with it. The Business will not name a specific payment gateway provider in these Terms unless and until one is actually integrated, at which point Clause 9.1 and the updated Privacy Notice will apply.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business will exercise reasonable care in selecting third-party service providers and will require, by written agreement, that any provider processing Player Data on its behalf maintain reasonable security safeguards and process such data only as instructed and for the purposes disclosed in the Privacy Notice.</p>
      <h2 id="privacy-data-protection" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">15. Privacy &amp; Data Protection</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.1 Incorporation of Privacy Notice and Schedule A</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business's Privacy Notice (published on the Platform) and Schedule A (Data Responsibility Matrix) to these Terms describe in detail how Player Data, Organiser data, and payment data are collected, used, stored, and protected, and are incorporated into, and form part of, these Terms.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.2 Compliance commitment and DPDP commencement status</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business will process personal data in accordance with the DPDP Act, the DPDP Rules, applicable provisions of the Information Technology Act, 2000 and rules made thereunder, and other applicable Indian data protection law. As at the date of this document, the Digital Personal Data Protection Rules, 2025 have been notified (dated 13 November 2025) together with an enforcement timeline under which the Act and Rules take effect in phases: certain procedural and institutional provisions (including establishment of the Data Protection Board of India) took effect on notification; provisions relating to Consent Managers take effect twelve months from notification; and the remaining substantive obligations, including the notice standards, security safeguards, breach-notification mechanics, retention-and-erasure triggers, and the verifiable-consent-for-children mechanics under Rule 10 that are most relevant to the Service, are presently scheduled to take effect eighteen months from notification. Given the volume of Child Player Data the Service processes, the Business's operational policy is to meet the substance of these not-yet-commenced requirements ahead of their scheduled commencement date, rather than waiting for that date, save that this Clause 15.2 does not itself alter the statutory date on which any provision becomes legally binding, and does not affect the analysis in Clause 6.1.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.3 Security safeguards</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business maintains reasonable technical and organisational security measures appropriate to the sensitivity of the data processed. The specific measures in place from time to time (which may include, without this Clause representing that all of them are presently in place, access controls, encryption, and periodic security review) are described in the Privacy Notice, which the Business will keep accurate and updated as its actual practices evolve. No system is completely secure, and Clause 18 (Limitation of Liability) applies to any security incident notwithstanding these safeguards.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.4 Breach notification</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">In the event of a personal data breach affecting Player Data, the Business will, as required by applicable law: notify the Data Protection Board of India where required; notify affected Organisers without undue delay; and, where the Business is the appropriate party to do so under Schedule A, take reasonable steps to notify or support the Organiser in notifying affected Players/Parents, describing the nature of the breach, the data affected, and the steps being taken.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.5 Retention and erasure</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Player Data and payment data are retained only for so long as reasonably necessary for the purposes described in the Privacy Notice, for so long as an Account remains active and for a reasonable period thereafter for legal, tax, dispute-resolution, and audit purposes, and in accordance with any retention schedule prescribed under the DPDP Rules once in force. Published Results are additionally governed by Clause 6.4 and 6.6.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.6 Cross-border transfer</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Player Data is presently hosted in India. If the Business engages any processor or sub-processor located outside India, or otherwise transfers personal data outside India, it will do so only in a manner consistent with the DPDP Act (including any country-specific restriction notified by the Central Government) and will update the Privacy Notice accordingly.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">15.7 Data Principal rights</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">A Data Principal (or, for a Child, their Parent) may write to the Grievance Officer under Clause 21 to exercise such rights as are, at the relevant time, available to them under the DPDP Act and the DPDP Rules then in force or operative in respect of the Business's processing of Player Data, and to make any complaint about that processing. The Business will confirm, in the Privacy Notice, which specific rights are currently exercisable against it (as opposed to rights that remain to take effect under the phased DPDP commencement referred to in Clause 15.2), the identity verification it will require (including, for a request concerning a Child, verification of the requestor's status as that Child's Parent, which may be carried out in coordination with the relevant Organiser under Clause 5.6), and the timelines within which it will respond.</p>
      <h2 id="availability-modifications-suspension" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">16. Availability, Modifications &amp; Suspension</h2>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; The Business will use reasonable efforts to keep the Service available but does not guarantee uninterrupted or error-free operation, and may suspend the Service for maintenance, security, or operational reasons with or without prior notice where reasonably necessary.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; The Business may modify, add to, or discontinue features of the Service at any time, provided that it will use reasonable efforts not to materially degrade features an Organiser has already paid for in respect of a specific Tournament without providing an equivalent alternative or a remedy under Clause 10.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; The Business may suspend or restrict access to an Account, with or without prior notice where reasonably necessary (for example, to prevent harm, respond to a suspected breach of Clause 13, or comply with a legal obligation), pending investigation of a suspected violation of these Terms, a payment dispute, or a legal or regulatory requirement.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; These Terms, the Privacy Notice, and the Refund Policy may be updated by the Business from time to time. Material changes will be notified on the Platform or by email to registered Organisers at least 15 days before taking effect, save where an immediate change is required by law or to address a security risk. Continued use of the Service after a change takes effect constitutes acceptance of the updated Terms.</p>
      <h2 id="disclaimers" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">17. Disclaimers</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">To the maximum extent permitted by applicable law, the Service is provided <strong>"as is"</strong> and <strong>"as available"</strong>, without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, non-infringement, and accuracy. Without limiting the foregoing, the Business does not warrant that:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	the extraction of a prize structure from a Brochure will be complete or error-free;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	Player Data uploaded by an Organiser is accurate, complete, or lawfully obtained;</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	computed prize allocations are free of error, or reflect the correct application of a Tournament's own rules beyond what was configured in the Service; or</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	the Service will be uninterrupted, secure, or free of defects.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Nothing in this Clause 17 excludes or limits liability that cannot be excluded or limited under applicable Indian law, including the Consumer Protection Act, 2019, to the extent it applies.</p>
      <h2 id="limitation-of-liability" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">18. Limitation of Liability</h2>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">1. To the maximum extent permitted by law, the Business's aggregate liability to an Organiser arising out of or in connection with these Terms or the Service, whether in contract, tort (including negligence), or otherwise, shall not exceed the total fees actually paid by that Organiser to the Business in the twelve (12) months preceding the event giving rise to the claim.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">2. To the maximum extent permitted by law, the Business shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, goodwill, or reputation, arising out of or in connection with the Service.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">3. Nothing in this Clause 18 limits or excludes liability for (a) death or personal injury caused by negligence, (b) fraud or fraudulent misrepresentation, (c) any liability that cannot be excluded or limited under applicable Indian law, or (d) the Business's obligations as a Data Fiduciary under the DPDP Act to the extent such obligations cannot be limited by contract.</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">4. The limitations in this Clause 18 apply regardless of the number of claims and are a fundamental basis of the bargain between the parties.</p>
      <h2 id="indemnity" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">19. Indemnity</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Organiser shall indemnify, defend, and hold harmless the Business, its officers, and (where applicable) the Operator personally, from and against any claim, loss, liability, damage, cost, or expense (including reasonable legal fees) arising out of or in connection with:</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; any breach by the Organiser of Clause 5 (Tournament Data &amp; Organiser Responsibilities), including any failure to satisfy the notice, lawful-basis, or evidentiary obligations in Clauses 5.2 and 5.3, or any false attestation under Clause 5.4;</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; any Player Data or User Content uploaded by the Organiser that is inaccurate, unlawfully obtained, or infringes the rights (including privacy or data protection rights) of any third party;</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; any dispute between the Organiser and a Player, Parent, club, federation, or other third party concerning a Tournament, its prize fund, or its results, other than a dispute arising solely from a defect in the Service's own computation contrary to correctly supplied inputs; and</p>
      <p className="mb-3 pl-5 text-sm leading-relaxed text-muted-foreground">&bull; the Organiser's breach of Clause 13 (Prohibited Uses) or of any applicable law.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Organiser's indemnification obligations under this Clause 19 are not subject to, and are not limited by, the cap in Clause 18.1.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business shall indemnify, defend, and hold harmless the Organiser from and against any claim, loss, liability, damage, cost, or expense (including reasonable legal fees) arising directly from the Business's own breach of its data-protection obligations under Clause 6, Clause 15, and Schedule A (whatever the Business's precise statutory classification is ultimately determined to be under Clause 6.1) in respect of the specific categories of Player Data the Business publishes under Clause 6.3, save to the extent such claim arises from inaccurate, unlawfully obtained, or non-consented Player Data supplied by the Organiser, in which case the first paragraph of this Clause 19 applies instead. For the avoidance of doubt, and unlike the Organiser's indemnity above, the Business's indemnification obligation under this paragraph is subject to, and aggregates with, the cap in Clause 18.1, save to the extent such cap is itself unenforceable in the circumstances giving rise to the claim (including any liability that Clause 18.3 identifies as non-excludable).</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The indemnifying party's obligations under this Clause 19 are subject to the indemnified party (a) promptly notifying the indemnifying party of the claim, (b) giving the indemnifying party reasonable control over its defence and settlement (without admitting liability on the indemnifying party's behalf), and (c) providing reasonable cooperation, at the indemnifying party's expense.</p>
      <h2 id="termination" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">20. Termination</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">20.1 Termination by the Organiser</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">An Organiser may stop using the Service and request deletion of its Account at any time by writing to chess.tushar@gmail.com, subject to Clause 15.5 (retention) and Clause 6 (published Results, which may continue to be retained as a tournament record unless removal is separately requested and actioned under Clause 6.6).</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">20.2 Suspension and termination by the Business</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business may suspend or terminate an Organiser's Account, with notice where reasonably practicable (and without notice where the Business reasonably believes immediate action is necessary to prevent harm, comply with law, or address fraud, security, or a serious or repeated breach of these Terms), where:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	the Organiser is in material breach of these Terms, including Clause 5 (data/consent obligations), Clause 9 (payment obligations), or Clause 13 (Prohibited Uses);</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	the Business is required to do so by law, regulation, or a competent court, tribunal, or governmental authority; or</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">●  	the Business reasonably determines that continued provision of the Service to that Organiser poses a legal, security, or reputational risk to the Business or to Players.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">20.3 Effect of termination</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">On termination of an Account, the Organiser's right to access the Service ceases, but these Terms will continue to apply to the extent necessary to give effect to Clauses 5, 6, 9, 10, 15, 18, 19, 21, 22, and 23, and to any Results already published, which will continue to be governed by Clause 6.</p>
      <h2 id="grievance-redressal" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">21. Grievance Redressal</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Business has designated the following Grievance Officer for complaints relating to the service:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">*Grievance Officer: Mr. Tushar Saraswat Email: chess.tushar@gmail.com Saraswat House, Bhitari, Hatiyanveer Baba Colony, Maheshpur, Varanasi, Uttar Pradesh 221107 *</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Any Organiser, Player, or Parent may lodge a grievance concerning the Service, including any complaint relating to Player Data, publication of Results, or payment, by writing to the Grievance Officer. The Business will acknowledge a grievance within a reasonable period, and in any event within the timelines prescribed under applicable law (including any timeline prescribed under the DPDP Rules once in force), and will endeavour to resolve it as expeditiously as possible.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where a grievance concerning Player Data cannot be resolved directly with the Business, the Data Principal (or Parent) may escalate the matter to the Data Protection Board of India in accordance with the DPDP Act.</p>
      <h2 id="governing-law-jurisdiction" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">22. Governing Law &amp; Jurisdiction</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">22.1 Governing law</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms, and any dispute or claim arising out of or in connection with them (including non-contractual disputes or claims), are governed by, and construed in accordance with, the laws of India.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">22.2 Arbitration</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Any dispute, controversy, or claim arising out of or in connection with these Terms, including any question regarding their existence, validity, or termination, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, as amended from time to time. The arbitration shall be conducted by a <strong>sole arbitrator</strong>, appointed by mutual agreement of the parties, or, failing agreement within thirty (30) days of a notice invoking arbitration, in accordance with the said Act. The seat and venue of arbitration shall be <strong>New Delhi, India</strong>, and the language of arbitration shall be English. The arbitral award shall be final and binding on the parties, subject to any right of challenge available under the Arbitration and Conciliation Act, 1996.</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Nothing in this Clause 22.2 restricts any right an Organiser may have, as a consumer or otherwise, to approach a consumer forum. to the extent such right cannot lawfully be excluded by agreement</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">22.3 Courts</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Subject to Clause 22.2, the courts at <strong>New Delhi, India</strong> shall have exclusive jurisdiction over any matter not required to be arbitrated (including applications for interim relief in aid of arbitration under Section 9 of the Arbitration and Conciliation Act, 1996), and each party submits to the exclusive jurisdiction of such courts for such purposes.</p>
      <h2 id="general-provisions" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">23. General Provisions</h2>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.1 Entity in transition</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Where the Business's registered entity name changes or is substituted for the Operator under Clause 1, the Business will notify Organisers via the Platform and/or email at least 15 days in advance, and such substitution will not affect the continuity or enforceability of these Terms, nor prejudice any right or remedy accrued before the substitution.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.2 Severability</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">If any provision of these Terms is held invalid or unenforceable, that provision will be enforced to the maximum extent permissible, and the remaining provisions will remain in full force and effect.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.3 No waiver</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">A failure or delay by either party to exercise any right under these Terms does not operate as a waiver of that right.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.4 Assignment</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The Organiser may not assign or transfer its rights or obligations under these Terms without the Business's prior written consent. The Business may assign or transfer these Terms in connection with a merger, acquisition, corporate restructuring (including the entity substitution contemplated in Clause 23.1), or sale of substantially all its assets relating to the Service, provided that the assignee agrees to be bound by these Terms and, in respect of Player Data, by data protection obligations no less protective than those in Clause 15 and Schedule A.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.5 Notices</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Notices to the Business must be sent to chess.tushar@gmail.com. Notices to an Organiser may be sent to the email address associated with its Account or displayed within the Platform.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.6 Force majeure</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Neither party is liable for any delay or failure to perform its obligations (other than payment obligations) resulting from causes beyond its reasonable control, including acts of God, internet or telecommunications failures, governmental action, or failures of third-party infrastructure or payment rails (including UPI or NPCI infrastructure).</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.7 Relationship of parties</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Nothing in these Terms creates a partnership, joint venture, agency, or employment relationship between the Business and any Organiser, save to the extent expressly stated in Clause 6.1 and Schedule A regarding the parties' respective data-protection responsibilities.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.8 Entire agreement</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms, together with the Privacy Notice, Refund Policy, and Schedules, constitute the entire agreement between the parties in relation to the Service and supersede all prior agreements or understandings, written or oral, on the subject.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.9 Language and precedence</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">These Terms are drafted in English. If translated into another language for convenience, the English version prevails in case of conflict.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.10 Contact</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Questions about these Terms may be sent to <a href="mailto:chess.tushar@gmail.com" className="text-primary underline underline-offset-2">chess.tushar@gmail.com</a>.</p>
      <h3 className="mt-6 mb-2 text-sm font-medium text-foreground">23.11 Electronic communications and records</h3>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">Standard clickwrap/e-records clause confirming Terms, notices, invoices, and attestations may be provided and retained electronically.</p>
      <h2 id="schedule-a-data-responsibility-matrix" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">A. Schedule A - Data Responsibility Matrix</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">This Schedule allocates responsibility between the Organiser and the Business for the principal activities involved in processing Player Data through the Service. It supplements, and does not override, Clauses 5, 6, and 15. Subject to the final determination of the parties' respective roles under applicable data-protection law, this Schedule reflects the parties' present agreement as to which of them will, in practice, carry out each activity; it is not itself intended to determine, and should not be read as conceding, either party's statutory classification.</p>
      <Table className="mb-3">
        <TableHeader>
          <TableRow>
            <TableHead>Activity</TableHead>
            <TableHead>Organiser</TableHead>
            <TableHead>Prize Manager (Business)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-sm text-muted-foreground">
          <TableRow>
            <TableCell>Informing Players/Parents that data will be uploaded to a third-party platform</TableCell>
            <TableCell>Primary responsibility</TableCell>
            <TableCell>Provides on-platform notice under Cl. 6.2; does not replace Organiser's own notice</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Obtaining verifiable parental consent for Child Players before upload</TableCell>
            <TableCell>Primary responsibility; must obtain and retain evidence</TableCell>
            <TableCell>Requires attestation at upload (Cl. 5.2,5.3,5.4); not a substitute for actual consent</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Accuracy of Player Data uploaded (name, DOB, school/club, etc.)</TableCell>
            <TableCell>Primary responsibility</TableCell>
            <TableCell>No independent verification performed</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Deciding what fields to publish on public Results Page</TableCell>
            <TableCell>May request Organiser-side customisation within permitted fields</TableCell>
            <TableCell>Determines and controls minimisation under Cl. 6.3 (name, school/club, category/prize only)</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Hosting and technical security of stored Player Data</TableCell>
            <TableCell></TableCell>
            <TableCell>Primary responsibility</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Publishing the Results Page and PDF</TableCell>
            <TableCell>Approves before publication</TableCell>
            <TableCell>Executes publication; responsible for what is shown</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Responding to correction/erasure requests from Players/Parents</TableCell>
            <TableCell>Supports verification of requestor where referred</TableCell>
            <TableCell>Primary responsibility for actioning; may verify via Organiser</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Breach notification to Data Protection Board / affected individuals</TableCell>
            <TableCell>Cooperates and supports notice to own Tournament contacts</TableCell>
            <TableCell>Primary responsibility</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Retention and deletion of non-published Player Data fields</TableCell>
            <TableCell>May request early deletion</TableCell>
            <TableCell>Primary responsibility per retention schedule</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Resolving disputes about prize eligibility/tournament conduct</TableCell>
            <TableCell>Primary responsibility</TableCell>
            <TableCell>No role beyond correcting computational errors</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <h2 id="schedule-b-player-data-fields-publication-status" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">B. Schedule B - Player Data Fields &amp; Publication Status</h2>
      <Table className="mb-3">
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Collected via Player File</TableHead>
            <TableHead>Published on public Results Page</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-sm text-muted-foreground">
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>Yes</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>School / Club</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>Yes</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Prize category label and prize won</TableCell>
            <TableCell>Configured by Organiser</TableCell>
            <TableCell>Yes</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Date of birth</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Exact / calculated age</TableCell>
            <TableCell>Derived</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Sex</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>FIDE rating</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No (unless Organiser separately discloses outside the Service)</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>FIDE ID</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Federation</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>City / State</TableCell>
            <TableCell>Yes</TableCell>
            <TableCell>No</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <h2 id="schedule-c-uploadtime-parental-consent-attestation" className="scroll-mt-24 mt-10 mb-3 text-lg font-medium">C. Schedule C - Upload-Time Parental Consent Attestation</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">The following attestation is presented to, and must be affirmatively checked by, every Organiser before a Player File can be uploaded, and is logged with a timestamp, the uploading Account, and the specific Tournament and file:</p>
      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">*"<strong>I confirm that, for every Player under the age of 18 years included in this file, I have informed that Player's parent or lawful guardian that the Player's name, </strong>date of birth<strong>, school/club, and tournament results will be uploaded to and published by Prize Manager, and I have obtained the verifiable consent of that parent or lawful guardian for such processing and publication, in accordance with the Digital Personal Data Protection Act, 2023. I understand that Prize Manager is relying on this confirmation and has not independently verified consent for any Player, and that a false confirmation is a material breach of the Terms of Service for which I and any organisation I represent may be held liable, including under the indemnity in Clause 19.</strong>"*</p>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
