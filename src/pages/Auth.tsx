import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PublicHeader } from "@/components/public/PublicHeader";
import { normalizeError, toastMessage } from "@/lib/errors/normalizeError";
import { logAuditEvent } from "@/lib/audit/logAuditEvent";

const REFERRAL_STORAGE_KEY = "pm_referral_code";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signIn, signUp } = useAuth();
  
  const initialMode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordCooldown, setForgotPasswordCooldown] = useState(0);
  
  // Resend confirmation state
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  // Referral code (only for signup)
  const [referralCode, setReferralCode] = useState(
    () => searchParams.get("ref") || ""
  );

  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1'));

  useEffect(() => {
    if (user) {
      // Apply pending referral code after authentication
      const pendingRef = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (pendingRef) {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        applyReferralCode(pendingRef);
      }
      navigate("/dashboard");
    }
  }, [user, navigate]);

  useEffect(() => {
    if (initialMode === 'signup') {
      setIsLogin(false);
    }
  }, [initialMode]);

  useEffect(() => {
    if (forgotPasswordCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setForgotPasswordCooldown((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotPasswordCooldown]);

  async function applyReferralCode(code: string) {
    try {
      const { data, error } = await supabase.rpc("apply_referral_code" as never, {
        referral_code: code,
      } as never);
      if (error) {
        // Don't block or scare
        console.warn("Referral apply error:", error.message);
        return;
      }
      const result = data as unknown as Record<string, unknown>;
      if (!result) return;
      const reason = String(result.reason ?? "");
      if (reason === "applied") {
        toast.success("Referral applied! Your referrer will earn rewards.");
      } else if (reason === "already_applied") {
        toast.info("Referral already applied.");
      } else if (reason === "invalid_code") {
        toast("Referral code not found.", { description: "You can continue without one." });
      } else if (reason === "self_referral_not_allowed") {
        toast("You can't refer yourself.", { description: "Share your code with others instead!" });
      }
    } catch {
      // Never block signup flow
    }
  }

  const handleForgotPassword = async () => {
    if (forgotPasswordLoading || forgotPasswordCooldown > 0) return;
    const emailToReset = email.trim();
    if (!emailToReset) {
      toast.error('Please enter your email address first');
      return;
    }
    setForgotPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) {
        const normalized = normalizeError(error);
        toast.error(toastMessage(normalized));
        logAuditEvent({ eventType: normalized.eventType, severity: normalized.severity, message: error.message, friendlyMessage: normalized.friendlyMessage, suggestedAction: normalized.suggestedAction, referenceId: normalized.referenceId });
      } else {
        toast.success('Password reset email sent! Check your inbox.');
        setForgotPasswordCooldown(60);
      }
    } catch {
      const normalized = normalizeError("Failed to send password reset email");
      toast.error(toastMessage(normalized));
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        const normalized = normalizeError(error);
        toast.error(toastMessage(normalized));
        logAuditEvent({ eventType: normalized.eventType, severity: normalized.severity, message: error.message, friendlyMessage: normalized.friendlyMessage, referenceId: normalized.referenceId });
      } else {
        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } else {
      // Store referral code before signup so it survives email confirmation
      const trimmedRef = referralCode.trim().toUpperCase();
      if (trimmedRef) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, trimmedRef);
      }

      // Build redirect URL with referral code embedded so it works cross-device
      const redirectUrl = trimmedRef
        ? `${window.location.origin}/auth/callback?ref=${encodeURIComponent(trimmedRef)}`
        : `${window.location.origin}/auth/callback`;

      const signUpOptions: Record<string, unknown> = { emailRedirectTo: redirectUrl };
      // Store referral in user_metadata so it survives cross-device confirmation
      if (trimmedRef) {
        signUpOptions.data = { pending_referral_code: trimmedRef };
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: signUpOptions,
      });
      if (error) {
        if (error.message.includes('already registered')) {
          const normalized = normalizeError(error);
          toast.error(toastMessage(normalized));
        } else {
          const normalized = normalizeError(error);
          toast.error(toastMessage(normalized));
        }
      } else if (data?.user?.identities?.length === 0) {
        toast.error("This email is already registered. Please sign in or resend confirmation.");
        setResendEmail(email);
        setShowResend(true);
      } else {
        toast.success("Account created! Please check your email to confirm.");
        setResendEmail(email);
        setShowResend(true);
      }
    }
    
    setLoading(false);
  };

  const handleResendConfirmation = async () => {
    const emailToResend = resendEmail.trim() || email.trim();
    if (!emailToResend) {
      toast.error('Please enter your email address');
      return;
    }
    setResendLoading(true);
    try {
      // Carry referral code in resend redirect if available (localStorage or form)
      const resendRef = referralCode.trim().toUpperCase() || localStorage.getItem(REFERRAL_STORAGE_KEY)?.trim().toUpperCase() || '';
      const resendRedirect = resendRef
        ? `${window.location.origin}/auth/callback?ref=${encodeURIComponent(resendRef)}`
        : `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailToResend,
        options: {
          emailRedirectTo: resendRedirect
        }
      });
      if (error) {
        if (error.message.toLowerCase().includes('not found') || error.message.toLowerCase().includes('does not exist')) {
          toast.error('No account found with this email. Please sign up first.');
        } else if (error.message.toLowerCase().includes('already confirmed')) {
          toast.success('Your email is already confirmed! You can sign in now.');
          setIsLogin(true);
          setShowResend(false);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Confirmation email sent! Check your inbox.');
      }
    } catch {
      toast.error('Failed to resend confirmation email');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Prize Manager</CardTitle>
            <CardDescription>
              {isLogin ? "Sign in to manage your tournaments" : "Create an account to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isLogin && isLocalhost && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  You're on localhost. Email confirmation links will redirect here, which may fail in production.
                </p>
              </div>
            )}

            {showResend && !isLogin && (
              <div className="mb-4 p-4 bg-muted/50 border border-border rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4" />
                  Didn't receive the email?
                </div>
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    className="w-full" 
                    onClick={handleResendConfirmation}
                    disabled={resendLoading}
                  >
                    {resendLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Resend Confirmation Email'
                    )}
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="organizer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {/* Referral code - signup only */}
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="referral-code">Referral Code (optional)</Label>
                <Input
                  id="referral-code"
                  type="text"
                  placeholder="e.g. REF-A1B2C3D4"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                />
              </div>
            )}

            {isLogin && (
              <div className="text-right">
                <Button 
                  type="button" 
                  variant="link" 
                  className="text-xs text-muted-foreground p-0 h-auto"
                  onClick={handleForgotPassword}
                  disabled={forgotPasswordLoading || forgotPasswordCooldown > 0}
                >
                  {forgotPasswordCooldown > 0
                    ? `Resend in ${forgotPasswordCooldown}s`
                    : forgotPasswordLoading
                      ? 'Sending...'
                      : 'Forgot password?'}
                </Button>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (isLogin ? "Signing in..." : "Creating account...") : (isLogin ? "Sign In" : "Create Account")}
            </Button>
            
            {!isLogin && !showResend && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  className="text-xs text-muted-foreground p-0 h-auto"
                  onClick={() => setShowResend(true)}
                >
                  Already signed up? Resend confirmation email
                </Button>
              </div>
            )}
            
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin ? "Don't have an account?" : "Already have an account?"}
              </span>
              <Button
                type="button"
                variant="link"
                className="ml-1 p-0 h-auto"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setShowResend(false);
                }}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </Button>
            </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
