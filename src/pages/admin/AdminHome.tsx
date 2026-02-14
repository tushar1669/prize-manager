import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const quickLinks = [
  { to: "/admin/users", title: "Users & Approvals", description: "Review new organizer requests and manage verification." },
  { to: "/admin/martech", title: "Martech", description: "Manage campaigns, coupon analytics, and promotion tools." },
  { to: "/admin/tournaments", title: "Tournaments", description: "Search and moderate tournaments across the platform." },
  { to: "/admin/coupons", title: "Coupons", description: "View coupon tooling and backend availability status." },
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
    </div>
  );
}
