import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EdgeFunctionStatus } from "@/components/EdgeFunctionStatus";

const quickLinks = [
  { to: "/admin/users", title: "Users & Access", description: "Manage organizer access, verification state, and moderation actions." },
  { to: "/admin/martech", title: "Martech", description: "View organizer growth, activation funnels, and revenue proxy analytics." },
  { to: "/admin/tournaments", title: "Tournaments", description: "Search and moderate tournaments across the platform." },
  { to: "/admin/coupons", title: "Coupons", description: "Manage coupon codes and view coupon analytics." },
  { to: "/admin/audit", title: "Audit Logs", description: "View error events, runtime diagnostics, and user-facing error references." },
  { to: "/admin/team-snapshots", title: "Team Snapshots", description: "Detect and backfill missing team allocation snapshots for published tournaments." },
];

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Overview</CardTitle>
          <CardDescription>Choose a section to manage platform operations.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {quickLinks.map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-lg">{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-primary">Open section →</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operations Diagnostics</CardTitle>
          <CardDescription>Manual health probes for platform runtime checks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="edge-function-status">
              <AccordionTrigger>Edge Function Health Probe</AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <EdgeFunctionStatus />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
