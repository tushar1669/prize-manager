import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/public/PublicHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Seo } from "@/components/seo/Seo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const tiers = [
  { range: "Up to 150 players", price: "Free" },
  { range: "151 to 500 players", price: "Rs 500" },
  { range: "More than 500 players", price: "Rs 1,000" },
] as const;

export default function Pricing() {
  return (
    <>
      <Seo
        title="Pricing | Prize Manager"
        description="Prize Manager pricing: free up to 150 players, Rs 500 up to 500 players, Rs 1,000 beyond that. Per tournament, not a subscription."
        path="/pricing"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <PublicHeader />
        <main className="flex-1">
          <div className="container mx-auto px-4 sm:px-6 py-12">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-foreground mb-2">Pricing</h1>
              <p className="text-sm text-muted-foreground mb-8">Per tournament, not a subscription.</p>

              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border bg-muted/50">
                      <TableHead>Players</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((tier) => (
                      <TableRow key={tier.range} className="border-border">
                        <TableCell className="font-medium text-foreground">{tier.range}</TableCell>
                        <TableCell className="text-muted-foreground">{tier.price}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-8 space-y-3 text-sm text-muted-foreground">
                <p>
                  Prize Manager is in public beta. New accounts receive a welcome coupon on sign-up, and
                  referrals earn further coupons.
                </p>
                <p>
                  Payment is by UPI; there is no card or net-banking processing.
                </p>
                <p>
                  See the{" "}
                  <Link to="/refund" className="text-primary underline underline-offset-2 hover:no-underline">
                    refund policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
