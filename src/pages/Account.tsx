import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, CheckCircle2, Gift, Copy, Users, Ticket, Link } from "lucide-react";
import { toast } from "sonner";
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

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied!`),
    () => toast.error(`Failed to copy ${label}`)
  );
}

export default function Account() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, isLoading, save, isSaving } = useOrganizerProfile();

  // Local form state
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

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

  // === Profile Reward Claim ===
  const [claimedCouponCode, setClaimedCouponCode] = useState<string | null>(null);

  const claimRewardMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_profile_completion_reward" as never);
      if (error) throw new Error(error.message);
      const result = data as unknown as Record<string, unknown>;
      if (!result?.ok) throw new Error(String(result?.reason ?? "unknown_error"));
      return result;
    },
    onSuccess: (result) => {
      const code = String(result.coupon_code ?? "");
      setClaimedCouponCode(code);
      queryClient.invalidateQueries({ queryKey: ["organizer-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-coupons"] });
      if (result.already_claimed) {
        toast.info("Reward already claimed.");
      } else {
        toast.success("🎉 Free tournament coupon issued!");
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "profile_incomplete") {
        toast.error("Please complete and save all 6 profile fields first.");
      } else {
        toast.error("Failed to claim reward. Please try again.");
      }
    },
  });

  // === Referral Code ===
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralAutoFetched, setReferralAutoFetched] = useState(false);

  const getReferralCodeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("get_or_create_my_referral_code" as never);
      if (error) throw new Error(error.message);
      const result = data as unknown as Record<string, unknown>;
      if (!result?.ok) throw new Error(String(result?.reason ?? "unknown_error"));
      return result;
    },
    onSuccess: (result) => {
      setReferralCode(String(result.code ?? ""));
    },
    onError: () => {
      // Only show toast if user explicitly clicked
      if (referralAutoFetched) return;
      toast.error("Failed to get referral code.");
    },
  });

  // Auto-fetch referral code on first render
  useEffect(() => {
    if (user?.id && !referralCode && !referralAutoFetched) {
      setReferralAutoFetched(true);
      getReferralCodeMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // === Referral Rewards ===
  const { data: referralRewards } = useQuery({
    queryKey: ["my-referral-rewards", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const unsafeSupabase = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
            };
          };
        };
      };
      const { data, error } = await unsafeSupabase
        .from("referral_rewards")
        .select("id,level,reward_type,coupon_id,created_at,trigger_user_id,trigger_tournament_id")
        .eq("beneficiary_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        id: string;
        level: number;
        reward_type: string;
        coupon_id: string | null;
        created_at: string;
        trigger_user_id: string;
        trigger_tournament_id: string;
      }>;
    },
  });

  // Fetch coupon codes for rewards that have coupon_id
  const rewardCouponIds = (referralRewards ?? [])
    .map((r) => r.coupon_id)
    .filter(Boolean) as string[];

  const { data: rewardCoupons } = useQuery({
    queryKey: ["reward-coupon-codes", rewardCouponIds.join(",")],
    enabled: rewardCouponIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("id,code,discount_value")
        .in("id", rewardCouponIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; code: string; discount_value: number }>;
    },
  });

  const couponCodeMap = new Map((rewardCoupons ?? []).map((c) => [c.id, c]));

  // === My Coupons ===
  const { data: myCoupons } = useQuery({
    queryKey: ["my-coupons", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("id,code,discount_type,discount_value,applies_to,is_active,ends_at,created_at")
        .eq("issued_to_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        code: string;
        discount_type: string;
        discount_value: number;
        applies_to: string;
        is_active: boolean;
        ends_at: string | null;
        created_at: string;
      }>;
    },
  });

  const discountLabel = (c: { discount_type: string; discount_value: number }) => {
    if (c.discount_type === "percent") return `${c.discount_value}% off`;
    if (c.discount_type === "amount") return `₹${c.discount_value} off`;
    if (c.discount_type === "fixed_price") return `₹${c.discount_value} final`;
    return String(c.discount_value);
  };

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
          <Card className={rewardClaimed ? "border-muted" : "border-emerald-300 dark:border-emerald-800"}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {rewardClaimed || claimedCouponCode ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <Gift className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                )}
                <div className="space-y-2">
                  {rewardClaimed || claimedCouponCode ? (
                    <>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300">
                        Profile completion reward claimed!
                      </p>
                      {claimedCouponCode && (
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                            {claimedCouponCode}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => copyToClipboard(claimedCouponCode, "Coupon code")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      {rewardClaimed && !claimedCouponCode && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => claimRewardMutation.mutate()}
                          disabled={claimRewardMutation.isPending}
                        >
                          {claimRewardMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : null}
                          Show my coupon code
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        🎉 You earned 1 free tournament upgrade!
                      </p>
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1.5"
                        onClick={() => claimRewardMutation.mutate()}
                        disabled={claimRewardMutation.isPending || !alreadyCompleted}
                      >
                        {claimRewardMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Gift className="h-3.5 w-3.5" />
                        )}
                        Claim Free Tournament
                      </Button>
                      {!alreadyCompleted && (
                        <p className="text-xs text-muted-foreground">
                          Save your profile first to claim.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Referral Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> My Referral Code
            </CardTitle>
            <CardDescription>
              Share your referral code with others. When they upgrade, you earn discount coupons (100% for direct, 50% for 2nd level, 25% for 3rd).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referralCode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="text-lg font-mono bg-muted px-3 py-1.5 rounded font-bold">
                    {referralCode}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(referralCode, "Referral code")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyToClipboard(
                    `${window.location.origin}/auth?mode=signup&ref=${referralCode}`,
                    "Referral signup link"
                  )}
                >
                  <Link className="h-3.5 w-3.5" />
                  Copy referral signup link
                </Button>
              </div>
            ) : (
              getReferralCodeMutation.isPending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading referral code...
                </div>
              ) : (
                <Button
                  onClick={() => getReferralCodeMutation.mutate()}
                  disabled={getReferralCodeMutation.isPending}
                >
                  Get My Referral Code
                </Button>
              )
            )}
          </CardContent>
        </Card>

        {/* Referral Rewards */}
        {(referralRewards ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-4 w-4" /> My Referral Rewards
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(referralRewards ?? []).map((reward) => {
                  const coupon = reward.coupon_id ? couponCodeMap.get(reward.coupon_id) : null;
                  return (
                    <div key={reward.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          Level {reward.level} reward
                          <span className="text-muted-foreground ml-1">
                            ({reward.level === 1 ? "100%" : reward.level === 2 ? "50%" : "25%"} off)
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(reward.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {coupon && (
                        <div className="flex items-center gap-1">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{coupon.code}</code>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(coupon.code, "Coupon")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* My Coupons */}
        {(myCoupons ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4" /> My Coupons
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(myCoupons ?? []).map((coupon) => (
                  <div key={coupon.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{coupon.code}</code>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(coupon.code, "Coupon")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {discountLabel(coupon)} · {coupon.applies_to}
                        {coupon.ends_at && (
                          <span className="ml-1">
                            · expires on {new Date(coupon.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge variant={coupon.is_active ? "default" : "secondary"} className="text-xs">
                      {coupon.is_active ? "Active" : "Used"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
