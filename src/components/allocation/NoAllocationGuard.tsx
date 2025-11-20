import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function NoAllocationGuard() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-amber-500" />
            <CardTitle>No allocation preview found</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Please re-run allocation from the Review step.
          </p>
          <div className="flex gap-3">
            <Button
              variant="default"
              onClick={() => navigate(`/t/${id}/review`)}
              className="flex-1"
            >
              Go to Review
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="flex-1"
            >
              Back to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
