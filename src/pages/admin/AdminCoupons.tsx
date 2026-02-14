import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, BarChart3 } from "lucide-react";
import { CouponCodesPanel } from "@/components/admin/coupons/CouponCodesPanel";
import { CouponAnalyticsPanel } from "@/components/admin/coupons/CouponAnalyticsPanel";
import { useCouponsAdmin } from "@/hooks/useCouponsAdmin";

export default function AdminCoupons() {
  const couponsAdmin = useCouponsAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Coupons</h2>
        <p className="text-muted-foreground">Manage coupon codes and redemption analytics.</p>
      </div>

      <Tabs defaultValue="codes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="codes" className="gap-1.5">
            <Ticket className="h-4 w-4" /> Codes
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="space-y-4">
          <CouponCodesPanel couponsAdmin={couponsAdmin} />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <CouponAnalyticsPanel couponsAdmin={couponsAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
