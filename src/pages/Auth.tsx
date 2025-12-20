import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, AlertTriangle, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signIn, signUp } = useAuth();
  
  // Check URL param for initial mode
  const initialMode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(initialMode !== 'signup');
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Resend confirmation state
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  // Detect localhost misconfiguration warning (for production deploys)
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1'));

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  // Update mode when URL param changes
  useEffect(() => {
    if (initialMode === 'signup') {
      setIsLogin(false);
    }
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        // Handle common signup errors with friendly messages
        if (error.message.includes('already registered')) {
          toast.error("This email is already registered. Please sign in instead.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Account created! Please check your email to confirm.");
        // Show resend option after successful signup
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
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailToResend,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        if (error.message.toLowerCase().includes('not found') || 
            error.message.toLowerCase().includes('does not exist')) {
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
    } catch (err) {
      toast.error('Failed to resend confirmation email');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Trophy className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Prize Manager</CardTitle>
          <CardDescription>
            {isLogin ? "Sign in to manage your tournaments" : "Create an account to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Localhost warning on signup only */}
          {!isLogin && isLocalhost && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                You're on localhost. Email confirmation links will redirect here, which may fail in production. 
                For production, use the deployed URL.
              </p>
            </div>
          )}

          {/* Resend confirmation section - shown after signup or when user requests */}
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
            {isLogin && (
              <div className="text-right">
                <Button type="button" variant="link" className="text-xs text-muted-foreground p-0 h-auto">
                  Forgot password?
                </Button>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (isLogin ? "Signing in..." : "Creating account...") : (isLogin ? "Sign In" : "Create Account")}
            </Button>
            
            {/* Resend link for signup mode */}
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
  );
}
