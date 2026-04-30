export type AdminSection = {
  to: string;
  label: string;
  description: string;
  end?: boolean;
};

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    to: "/admin",
    label: "Overview",
    description: "Choose a section to manage platform operations.",
    end: true,
  },
  {
    to: "/admin/users",
    label: "Users & Access",
    description: "Manage organizer access, legacy organizer exceptions, and access moderation exceptions.",
  },
  {
    to: "/admin/martech",
    label: "Martech",
    description: "View organizer growth, activation funnels, and revenue proxy analytics.",
  },
  {
    to: "/admin/tournaments",
    label: "Tournaments",
    description: "Search and moderate tournaments across the platform.",
  },
  {
    to: "/admin/coupons",
    label: "Coupons",
    description: "Manage coupon codes and view coupon analytics.",
  },
  {
    to: "/admin/audit",
    label: "Audit Logs",
    description: "View error events, runtime diagnostics, and user-facing error references.",
  },
  {
    to: "/admin/team-snapshots",
    label: "Team Snapshots",
    description: "Detect and backfill missing team allocation snapshots for published tournaments.",
  },
];
