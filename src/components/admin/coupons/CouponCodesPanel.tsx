import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CouponFormDialog } from "@/components/martech/CouponFormDialog";
import { CouponTable } from "@/components/martech/CouponTable";
import { AdminCallout } from "@/components/admin/AdminCallout";
import { useCouponsAdmin } from "@/hooks/useCouponsAdmin";

type CouponFilter = "all" | "global" | "targeted";
type SourceFilter = "all" | "admin" | "system";

interface CouponCodesPanelProps {
  couponsAdmin: ReturnType<typeof useCouponsAdmin>;
}

export function CouponCodesPanel({ couponsAdmin }: CouponCodesPanelProps) {
  const [filter, setFilter] = useState<CouponFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");

  const isSystemOrigin = (origin: string | null | undefined) =>
    origin === "profile_reward" || origin?.startsWith("referral_");

  const filteredCoupons = useMemo(() => {
    let list = couponsAdmin.coupons;

    // Filter by type
    if (filter === "global") {
      list = list.filter((c) => !c.issued_to_user_id && !c.issued_to_email);
    } else if (filter === "targeted") {
      list = list.filter((c) => !!c.issued_to_user_id || !!c.issued_to_email);
    }

    // Filter by source
    if (sourceFilter === "admin") {
      list = list.filter((c) => !isSystemOrigin(c.origin));
    } else if (sourceFilter === "system") {
      list = list.filter((c) => isSystemOrigin(c.origin));
    }

    // Search by code prefix
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((c) => c.code.toUpperCase().includes(q));
    }

    return list;
  }, [couponsAdmin.coupons, filter, sourceFilter, search]);

  const globalCount = couponsAdmin.coupons.filter((c) => !c.issued_to_user_id && !c.issued_to_email).length;
  const targetedCount = couponsAdmin.coupons.length - globalCount;

  return (
    <>
      {couponsAdmin.couponsAccessBlocked ? (
        <AdminCallout
          title="Coupons access blocked by DB grants/RLS"
          description="Coupon tables are reachable only after grants and RLS are fixed."
          ctaLabel="Run Supabase SQL fix"
          ctaHref={couponsAdmin.sqlFixUrl}
        />
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Coupon Codes</CardTitle>
            <CardDescription>Create and manage discount coupons</CardDescription>
          </div>
          <Button onClick={couponsAdmin.openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Coupon
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter toggles + search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {(["all", "global", "targeted"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => setFilter(f)}
                >
                  {f}
                  {f === "all" && <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{couponsAdmin.coupons.length}</Badge>}
                  {f === "global" && <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{globalCount}</Badge>}
                  {f === "targeted" && <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">{targetedCount}</Badge>}
                </Button>
              ))}
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-1 border-l pl-2 ml-1">
              {(["all", "admin", "system"] as const).map((sf) => (
                <Button
                  key={sf}
                  variant={sourceFilter === sf ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => setSourceFilter(sf)}
                >
                  {sf === "all" ? "All Sources" : sf === "admin" ? "Admin" : "System"}
                </Button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search code (e.g. PROFILE-, REF1-)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-8 text-xs"
              />
            </div>

            {/* Quick prefix buttons */}
            {["PROFILE-", "REF1-", "REF2-", "REF3-"].map((prefix) => (
              <Button
                key={prefix}
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setSearch(prefix)}
              >
                {prefix}
              </Button>
            ))}
          </div>

          <CouponTable
            coupons={filteredCoupons}
            redemptions={couponsAdmin.redemptions}
            isLoading={couponsAdmin.couponsLoading}
            onEdit={couponsAdmin.openEdit}
            onToggleActive={(id, is_active) => couponsAdmin.toggleMutation.mutate({ id, is_active })}
            isToggling={couponsAdmin.toggleMutation.isPending}
          />
        </CardContent>
      </Card>

      <CouponFormDialog
        open={couponsAdmin.dialogOpen}
        onOpenChange={couponsAdmin.setDialogOpen}
        form={couponsAdmin.form}
        setForm={couponsAdmin.setForm}
        editingCoupon={couponsAdmin.editingCoupon}
        onRegenerateCode={couponsAdmin.regenerateCreateCode}
        onSave={couponsAdmin.handleSave}
        isSaving={couponsAdmin.saveMutation.isPending}
      />
    </>
  );
}
