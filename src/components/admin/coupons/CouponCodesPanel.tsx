import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CouponFormDialog } from "@/components/martech/CouponFormDialog";
import { CouponTable } from "@/components/martech/CouponTable";
import { AdminCallout } from "@/components/admin/AdminCallout";
import { useCouponsAdmin } from "@/hooks/useCouponsAdmin";

interface CouponCodesPanelProps {
  couponsAdmin: ReturnType<typeof useCouponsAdmin>;
}

export function CouponCodesPanel({ couponsAdmin }: CouponCodesPanelProps) {
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
        <CardContent>
          <CouponTable
            coupons={couponsAdmin.coupons}
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
        onSave={couponsAdmin.handleSave}
        isSaving={couponsAdmin.saveMutation.isPending}
      />
    </>
  );
}
