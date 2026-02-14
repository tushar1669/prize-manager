import { CouponAnalytics } from "@/components/martech/CouponAnalytics";
import { AdminCallout } from "@/components/admin/AdminCallout";
import { useCouponsAdmin } from "@/hooks/useCouponsAdmin";

interface CouponAnalyticsPanelProps {
  couponsAdmin: ReturnType<typeof useCouponsAdmin>;
}

export function CouponAnalyticsPanel({ couponsAdmin }: CouponAnalyticsPanelProps) {
  return (
    <div className="space-y-4">
      {couponsAdmin.redemptionsAccessBlocked ? (
        <AdminCallout
          title="Coupons access blocked by DB grants/RLS"
          description="Coupon analytics are blocked until grants and RLS are fixed."
          ctaLabel="Run Supabase SQL fix"
          ctaHref={couponsAdmin.sqlFixUrl}
        />
      ) : null}
      <CouponAnalytics coupons={couponsAdmin.coupons} redemptions={couponsAdmin.redemptions} />
    </div>
  );
}
