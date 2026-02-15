import { NavLink, Outlet } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { cn } from "@/lib/utils";

const adminLinks = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/users", label: "Users/Approvals" },
  { to: "/admin/martech", label: "Martech" },
  { to: "/admin/tournaments", label: "Tournaments" },
  { to: "/admin/coupons", label: "Coupons" },
];

const buildStamp = `${__BUILD_COMMIT__} · ${__BUILD_TIME__}`;

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Admin</h1>
          <p className="text-muted-foreground">Master tools and moderation controls</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-lg border border-border bg-card p-3 h-fit">
            <nav className="flex flex-col gap-1">
              {adminLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <NavLink
                to="/dashboard"
                className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Back to Dashboard
              </NavLink>
            </nav>
          </aside>

          <main>
            <Outlet />
          </main>
        </div>

        <div className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
          Build stamp: {buildStamp}
        </div>
      </div>
    </div>
  );
}
