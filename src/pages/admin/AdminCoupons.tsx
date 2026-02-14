import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export default function AdminCoupons() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-coupons-healthcheck"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("coupons")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return data;
    },
  });

  const backendAvailable = !error;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coupons</CardTitle>
        <CardDescription>Standalone coupon admin route availability.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking coupon backend…</p>
        ) : backendAvailable ? (
          <>
            <Badge>Backend connected</Badge>
            <p className="text-sm text-muted-foreground">
              Coupon tables are reachable. Use the Martech page for full coupon management.
            </p>
          </>
        ) : (
          <>
            <Badge variant="outline">Backend not deployed</Badge>
            <p className="text-sm text-muted-foreground">
              Coupon backend is not available in this environment yet.
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">Route: /admin/coupons</p>
      </CardContent>
    </Card>
  );
}
