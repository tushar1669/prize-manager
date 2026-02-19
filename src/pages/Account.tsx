import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizerProfile } from "@/hooks/useOrganizerProfile";
import { AppNav } from "@/components/AppNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Gift, Lock } from "lucide-react";
import {
  completionPercent,
  isProfileComplete,
  PROFILE_FIELDS,
  type ProfileData,
} from "@/utils/profileCompletion";

const FIELD_LABELS: Record<string, { label: string; placeholder: string }> = {
  display_name: { label: "Full Name", placeholder: "Your full name" },
  phone: { label: "Phone Number", placeholder: "+91 98765 43210" },
  city: { label: "City", placeholder: "e.g. Mumbai" },
  org_name: { label: "Organization Name", placeholder: "e.g. Chess Academy India" },
  fide_arbiter_id: { label: "FIDE Arbiter ID", placeholder: "e.g. 12345678" },
  website: { label: "Website", placeholder: "https://example.com" },
};

export default function Account() {
  const { user } = useAuth();
  const { profile, isLoading, save, isSaving } = useOrganizerProfile();

  // Local form state
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  // Initialize form from profile data once loaded
  useEffect(() => {
    if (profile && !initialized) {
      const initial: Record<string, string> = {};
      for (const field of PROFILE_FIELDS) {
        initial[field] = (profile[field] as string) ?? "";
      }
      setForm(initial);
      setInitialized(true);
    }
  }, [profile, initialized]);

  const handleFieldChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const updates: Partial<ProfileData> = {};
    for (const field of PROFILE_FIELDS) {
      const val = form[field]?.trim() || null;
      (updates as Record<string, unknown>)[field] = val;
    }
    save(updates);
  };

  const percent = completionPercent(form as unknown as Partial<ProfileData>);
  const complete = isProfileComplete(form as unknown as Partial<ProfileData>);
  const alreadyCompleted = !!profile?.profile_completed_at;
  const rewardClaimed = !!profile?.profile_reward_claimed;

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="container mx-auto px-6 py-8 max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">Account Settings</h1>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Email Address</p>
              <p className="font-medium text-foreground">{user?.email ?? "—"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Profile Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Organizer Profile</CardTitle>
                <CardDescription className="mt-1">
                  Complete your profile to earn 1 free tournament upgrade.
                </CardDescription>
              </div>
              <Badge variant={complete ? "default" : "secondary"} className="text-sm">
                {percent}%
              </Badge>
            </div>
            <Progress value={percent} className="mt-3 h-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {PROFILE_FIELDS.map((field) => {
                    const meta = FIELD_LABELS[field];
                    return (
                      <div key={field} className="space-y-1.5">
                        <Label htmlFor={`profile-${field}`}>{meta.label}</Label>
                        <Input
                          id={`profile-${field}`}
                          placeholder={meta.placeholder}
                          value={form[field] ?? ""}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                      </span>
                    ) : (
                      "Save Profile"
                    )}
                  </Button>
                  {complete && !alreadyCompleted && (
                    <p className="text-xs text-muted-foreground">
                      Save to lock in your profile completion reward.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completion Reward */}
        {(alreadyCompleted || complete) && (
          <Card className={rewardClaimed
            ? "border-muted"
            : "border-emerald-300 dark:border-emerald-800"
          }>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {rewardClaimed ? (
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                ) : (
                  <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                )}
                <div className="space-y-2">
                  {rewardClaimed ? (
                    <p className="text-sm text-muted-foreground">
                      Profile completion reward already claimed.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        🎉 You earned 1 free tournament upgrade!
                      </p>
                      <Button size="sm" variant="outline" disabled className="gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        Claim Free Tournament
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Reward claim will be enabled after backend activation.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
