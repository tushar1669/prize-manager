import { useNavigate, useParams } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Save } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function Settings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [strictAge, setStrictAge] = useState(true);
  const [allowUnrated, setAllowUnrated] = useState(false);
  const [preferMain, setPreferMain] = useState(true);

  const categories = [
    { id: "1", name: "Main (Open)", locked: true },
    { id: "2", name: "Under 13" },
    { id: "3", name: "Under 17" },
    { id: "4", name: "Female" },
  ];

  const handleSave = () => {
    toast.success("Settings saved successfully");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Tournament Settings</h1>
          <p className="text-muted-foreground">Configure allocation rules and preferences</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Default Allocation Rules</CardTitle>
              <CardDescription>
                These rules govern how prizes are automatically allocated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="strict-age" className="text-foreground font-medium">
                    Strict Age Eligibility
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Players can only win prizes in their exact age category
                  </p>
                </div>
                <Switch
                  id="strict-age"
                  checked={strictAge}
                  onCheckedChange={setStrictAge}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="allow-unrated" className="text-foreground font-medium">
                    Allow Unrated in Rating Categories
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Include unrated players when allocating rating bracket prizes
                  </p>
                </div>
                <Switch
                  id="allow-unrated"
                  checked={allowUnrated}
                  onCheckedChange={setAllowUnrated}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <Label htmlFor="prefer-main" className="text-foreground font-medium">
                    Prefer Main on Equal Value
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    When prizes have equal cash value, prefer main category over others
                  </p>
                </div>
                <Switch
                  id="prefer-main"
                  checked={preferMain}
                  onCheckedChange={setPreferMain}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category Priority Order</CardTitle>
              <CardDescription>
                Drag to reorder categories by priority (higher = better when values are equal)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border"
                  >
                    {!category.locked && (
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-move" />
                    )}
                    <span className="flex-1 font-medium text-foreground">{category.name}</span>
                    {category.locked && (
                      <span className="text-xs text-muted-foreground">(Fixed)</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PDF Export Branding</CardTitle>
              <CardDescription>
                Customize how your exported documents appear
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g., State Chess Association"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">Contact Line</Label>
                <Input
                  id="contact"
                  placeholder="e.g., info@chess.org | +91 123 456 7890"
                />
              </div>

              <div className="space-y-2">
                <Label>Organization Logo</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Upload logo for PDF header (optional)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
