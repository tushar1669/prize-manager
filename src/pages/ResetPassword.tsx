import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicHeader } from "@/components/public/PublicHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasRecoveryAccess, setHasRecoveryAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;

    const setAccessIfActive = (value: boolean) => {
      if (active) {
        setHasRecoveryAccess(value);
      }
    };

    const setCheckingIfActive = (value: boolean) => {
      if (active) {
        setCheckingAccess(value);
      }
    };

    const resolveInitialAccess = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAccessIfActive(true);
      }
      setCheckingIfActive(false);
    };

    void resolveInitialAccess();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAccessIfActive(true);
        setCheckingIfActive(false);
        return;
      }

      if (session) {
        setAccessIfActive(true);
        setCheckingIfActive(false);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes("expired") || lowerMessage.includes("invalid")) {
          toast.error("This reset link is invalid or expired. Request a new one.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Password updated. Please sign in with your new password.");
      navigate("/auth", { replace: true });
    } catch {
      toast.error("Unable to update password right now. Please request a new reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Set new password</CardTitle>
            <CardDescription>
              {hasRecoveryAccess
                ? "Choose a strong password to finish resetting your account."
                : "Use the password reset link from your email to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkingAccess ? (
              <p className="text-sm text-muted-foreground">Checking reset link…</p>
            ) : hasRecoveryAccess ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating password..." : "Update password"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This reset link is invalid or expired. Request a new one.
                </p>
                <Button asChild className="w-full">
                  <Link to="/auth">Back to sign in</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
