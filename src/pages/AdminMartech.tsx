import { useNavigate } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AdminMartechProps {
  embeddedInAdmin?: boolean;
}

export default function AdminMartech({ embeddedInAdmin = false }: AdminMartechProps) {
  const navigate = useNavigate();

  return (
    <div className={embeddedInAdmin ? "px-0 py-0" : "container mx-auto px-6 py-8 max-w-6xl"}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Martech</h2>
          <p className="text-muted-foreground">Marketing and platform analytics tools.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" /> Martech (coming soon)
            </CardTitle>
            <CardDescription>
              Coupon operations now live in a dedicated admin area. Future non-coupon analytics will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/coupons")}>Manage Coupons</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
