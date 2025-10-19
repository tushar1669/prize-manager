import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileDown, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Finalize() {
  const { id } = useParams();
  const navigate = useNavigate();

  const handleExportPDF = () => {
    toast.success("Generating PDF...");
  };

  const handleExportCSV = () => {
    toast.success("Generating CSV...");
  };

  const handlePublish = () => {
    toast.success("Tournament published successfully!");
    navigate(`/t/${id}/publish`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">Finalize Allocations</h1>
            <Badge className="bg-primary text-primary-foreground">v1</Badge>
          </div>
          <p className="text-muted-foreground">
            Review final allocations before publishing
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tournament Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">67</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Players</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-foreground">8</p>
                  <p className="text-sm text-muted-foreground mt-1">Prize Categories</p>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold text-accent">₹45,000</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Prize Fund</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allocation Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Main Prizes Awarded</span>
                <span className="font-medium text-foreground">10 prizes</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Category Prizes Awarded</span>
                <span className="font-medium text-foreground">23 prizes</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Cash Distributed</span>
                <span className="font-medium text-accent">₹42,500</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Trophies Awarded</span>
                <span className="font-medium text-foreground">8</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Medals Awarded</span>
                <span className="font-medium text-foreground">15</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={handleExportPDF}
                variant="outline"
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  Download PDF Report
                </span>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  Download CSV Export
                </span>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4">
                By publishing, you create an immutable version (v1) of these allocations.
                The tournament will be available at a public URL that can be shared with participants.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => navigate(`/t/${id}/review`)}>
              Back to Review
            </Button>
            <Button onClick={handlePublish} className="gap-2">
              Publish Tournament
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
