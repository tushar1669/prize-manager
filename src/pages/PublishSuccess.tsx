import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Copy, ExternalLink, Eye, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function PublishSuccess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const version = location.state?.version || 1;
  const [isPublished, setIsPublished] = useState(true);
  const publicUrl = `https://prize-manager.com/t/${id}/public`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied to clipboard!");
  };

  const handleViewPublic = () => {
    navigate(`/t/${id}/public`);
  };

  const handleUnpublish = () => {
    setIsPublished(false);
    toast.info("Tournament unpublished");
  };

  const handleRepublish = () => {
    setIsPublished(true);
    toast.success("Tournament republished as v2");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isPublished ? "Tournament Published!" : "Tournament Unpublished"}
          </h1>
          <p className="text-muted-foreground">
            {isPublished
              ? "Your prize allocations are now live and accessible to participants"
              : "This tournament is no longer publicly accessible"}
          </p>
        </div>

        {isPublished ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Public URL
                  </label>
                  <div className="flex gap-2">
                    <Input value={publicUrl} readOnly className="font-mono text-sm" />
                    <Button onClick={handleCopyLink} variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={handleViewPublic} className="gap-2">
                    <Eye className="h-4 w-4" />
                    View Public Page
                  </Button>
                  <Button
                    onClick={() => window.open(publicUrl, "_blank")}
                    variant="outline"
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in New Tab
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-semibold text-foreground mb-3">Manage Publication</h3>
                
                <Button
                  onClick={handleUnpublish}
                  variant="outline"
                  className="w-full justify-start gap-2 text-warning border-warning/30 hover:bg-warning/10"
                >
                  <XCircle className="h-4 w-4" />
                  Unpublish Tournament
                </Button>

                <Button
                  onClick={handleRepublish}
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Republish (Create v2)
                </Button>

                <p className="text-xs text-muted-foreground mt-4">
                  Unpublishing will hide the public page. Republishing after changes will create a new version.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="pt-6 text-center">
                <p className="text-foreground mb-4">
                  This tournament is currently unpublished and not accessible to the public.
                </p>
                <Button onClick={handleRepublish} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Republish Tournament
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
