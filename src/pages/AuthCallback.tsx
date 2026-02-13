import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Mail } from "lucide-react";
import { toast } from "sonner";

type CallbackStatus = 'loading' | 'success' | 'error' | 'expired' | 'missing';

// Check if we're in dev/preview environment
const isDevOrPreview = () => {
  if (typeof window === 'undefined') return false;
  const origin = window.location.origin;
  return origin.includes('localhost') || 
         origin.includes('127.0.0.1') || 
         origin.includes('preview');
};

interface DebugInfo {
  hasCode: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasError: boolean;
  errorParam: string | null;
  origin: string;
}

/**
 * AuthCallback handles email confirmation redirects from Supabase.
 * Supports:
 * - PKCE flow: URL contains ?code=...
 * - Hash token flow: URL hash contains access_token/refresh_token
 * - Error params: URL contains ?error=...
 * - Recovery flow: No tokens, user can resend confirmation
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flowType, setFlowType] = useState<string>('unknown');
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  
  // Resend confirmation state
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse all possible auth params
        const code = searchParams.get('code');
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const token = searchParams.get('token');
        const tokenHash = searchParams.get('token_hash');
        const otpType = searchParams.get('type');

        // Build debug info
        const debug: DebugInfo = {
          hasCode: !!code,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasError: !!errorParam,
          errorParam,
          origin: window.location.origin
        };
        setDebugInfo(debug);

        console.log('[auth-callback] Params detected:', debug);

        // Case 1: Error in URL params (e.g., expired link)
        if (errorParam) {
          console.error('[auth-callback] URL error:', errorParam, errorDescription);
          const message = errorDescription || errorParam;
          
          if (message.toLowerCase().includes('expired') || 
              message.toLowerCase().includes('invalid') ||
              errorParam === 'access_denied') {
            setFlowType('expired');
            setStatus('expired');
            setErrorMessage('This confirmation link has expired or was already used.');
            toast.error('Link expired - please request a new one');
          } else {
            setFlowType('error');
            setStatus('error');
            setErrorMessage(message);
            toast.error(message);
          }
          return;
        }

        // Case 2: OTP flow - URL has ?token=...&type=...
        if (otpType && (token || tokenHash)) {
          setFlowType('otp');
          console.log('[auth-callback] OTP flow: verifying token');
          toast.info('Verifying your email...');

          // Build the OTP params - token_hash is required for VerifyTokenHashParams
          const otpParams = tokenHash 
            ? { type: otpType as 'signup', token_hash: tokenHash }
            : { type: otpType as 'email', email: '', token: token || '' };
          
          const { data, error } = await supabase.auth.verifyOtp(otpParams);

          if (error) {
            console.error('[auth-callback] OTP verification error:', error);

            if (error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('invalid')) {
              setStatus('expired');
              setErrorMessage('This confirmation link has expired. Please request a new one.');
              toast.error('Link expired');
            } else {
              setStatus('error');
              setErrorMessage(error.message);
              toast.error(error.message);
            }
            return;
          }

          console.log('[auth-callback] OTP verification successful');
          toast.success('Email verified successfully!');
          setStatus('success');

          await redirectAfterAuth();
          return;
        }

        // Case 3: PKCE flow - URL has ?code=...
        if (code) {
          setFlowType('pkce');
          console.log('[auth-callback] PKCE flow: exchanging code for session');
          toast.info('Verifying your email...');
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('[auth-callback] PKCE exchange error:', error);
            
            if (error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('invalid')) {
              setStatus('expired');
              setErrorMessage('This confirmation link has expired. Please request a new one.');
              toast.error('Link expired');
            } else {
              setStatus('error');
              setErrorMessage(error.message);
              toast.error(error.message);
            }
            return;
          }
          
          console.log('[auth-callback] PKCE exchange successful');
          toast.success('Email verified successfully!');
          setStatus('success');
          
          await redirectAfterAuth();
          return;
        }

        // Case 4: Hash token flow - URL hash contains tokens
        if (accessToken && refreshToken) {
          setFlowType('hash');
          console.log('[auth-callback] Hash flow: setting session from tokens');
          toast.info('Completing sign in...');
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('[auth-callback] Set session error:', error);
            
            if (error.message.toLowerCase().includes('expired') ||
                error.message.toLowerCase().includes('invalid')) {
              setStatus('expired');
              setErrorMessage('This link has expired. Please request a new one.');
              toast.error('Session expired');
            } else {
              setStatus('error');
              setErrorMessage(error.message);
              toast.error(error.message);
            }
            return;
          }
          
          console.log('[auth-callback] Session set successfully');
          toast.success('Signed in successfully!');
          setStatus('success');
          
          await redirectAfterAuth();
          return;
        }

        // Case 5: No auth parameters - check if already authenticated
        console.log('[auth-callback] No auth params, checking existing session');
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setFlowType('existing-session');
          console.log('[auth-callback] Already authenticated');
          setStatus('success');
          toast.success('Already signed in');
          await redirectAfterAuth();
          return;
        }

        // Case 6: No tokens found and not authenticated - show recovery UI
        console.warn('[auth-callback] No auth tokens and no existing session - showing recovery');
        setFlowType('missing');
        setStatus('missing');
        setErrorMessage('No authentication data found. The link may be incomplete, expired, or already used.');
        toast.info('Please sign in or resend your confirmation email');
        
      } catch (err) {
        console.error('[auth-callback] Unexpected error:', err);
        setFlowType('error');
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
        toast.error('Something went wrong');
      }
    };

    /**
     * Redirect user after successful auth based on their role/verification status
     */
    const redirectAfterAuth = async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/dashboard', { replace: true });
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('user_id', user.id)
        .single();

      console.log('[auth-callback] User role data:', roleData);

      if (roleData?.role === 'master' || roleData?.is_verified) {
        console.log('[auth-callback] Redirecting verified user to dashboard');
        navigate('/dashboard', { replace: true });
      } else {
        console.log('[auth-callback] Redirecting unverified user to pending-approval');
        navigate('/pending-approval', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  // Handle resend confirmation email
  const handleResendConfirmation = async () => {
    if (!resendEmail.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (error) {
        // Handle common errors
        if (error.message.toLowerCase().includes('not found') || 
            error.message.toLowerCase().includes('does not exist')) {
          toast.error('No account found with this email. Please sign up first.');
        } else if (error.message.toLowerCase().includes('already confirmed')) {
          toast.success('Your email is already confirmed! You can sign in.');
          setTimeout(() => navigate('/auth'), 1500);
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

  // Debug panel for dev/preview environments
  const DebugPanel = () => {
    if (!isDevOrPreview() || !debugInfo) return null;
    
    return (
      <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border text-xs font-mono">
        <div className="font-semibold mb-2 text-muted-foreground">Debug Info (dev/preview only)</div>
        <div className="space-y-1 text-muted-foreground">
          <div>Flow: <span className="text-foreground">{flowType}</span></div>
          <div>code: <span className={debugInfo.hasCode ? "text-green-600" : "text-red-500"}>{debugInfo.hasCode ? '✓' : '✗'}</span></div>
          <div>access_token: <span className={debugInfo.hasAccessToken ? "text-green-600" : "text-red-500"}>{debugInfo.hasAccessToken ? '✓' : '✗'}</span></div>
          <div>refresh_token: <span className={debugInfo.hasRefreshToken ? "text-green-600" : "text-red-500"}>{debugInfo.hasRefreshToken ? '✓' : '✗'}</span></div>
          <div>error: <span className={debugInfo.hasError ? "text-amber-600" : "text-muted-foreground"}>{debugInfo.errorParam || 'none'}</span></div>
          <div>origin: <span className="text-foreground break-all">{debugInfo.origin}</span></div>
        </div>
      </div>
    );
  };

  // Recovery UI for missing tokens
  if (status === 'missing') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Mail className="h-10 w-10 text-amber-500" />
              </div>
            </div>
            <CardTitle className="text-2xl">Confirmation Required</CardTitle>
            <CardDescription className="text-base">
              {errorMessage || 'No authentication data found in this link.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              If you haven't confirmed your email yet, enter it below to resend the confirmation link.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="resend-email">Email address</Label>
              <Input
                id="resend-email"
                type="email"
                placeholder="your@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResendConfirmation()}
              />
            </div>
            
            <Button 
              onClick={handleResendConfirmation} 
              className="w-full" 
              disabled={resendLoading}
            >
              {resendLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Resend Confirmation Email
                </>
              )}
            </Button>
            
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                Go to Sign In
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => navigate('/auth?mode=signup')} 
                className="w-full text-muted-foreground"
              >
                Back to Signup
              </Button>
            </div>
            
            <DebugPanel />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Expired link UI
  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <RefreshCw className="h-10 w-10 text-amber-500" />
              </div>
            </div>
            <CardTitle className="text-2xl">Link Expired</CardTitle>
            <CardDescription className="text-base">
              {errorMessage || 'This confirmation link has expired or was already used.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your email to request a new confirmation link, or sign in if you've already verified.
            </p>
            
            <div className="space-y-2">
              <Label htmlFor="expired-resend-email">Email address</Label>
              <Input
                id="expired-resend-email"
                type="email"
                placeholder="your@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleResendConfirmation()}
              />
            </div>
            
            <Button 
              onClick={handleResendConfirmation} 
              className="w-full" 
              disabled={resendLoading}
            >
              {resendLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Resend Confirmation Email
                </>
              )}
            </Button>
            
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                Go to Sign In
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => navigate('/auth?mode=signup')} 
                className="w-full text-muted-foreground"
              >
                Back to Signup
              </Button>
            </div>
            
            <DebugPanel />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading/Success/Error states
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <div className="p-3 rounded-full bg-primary/10">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
            )}
            {status === 'success' && (
              <div className="p-3 rounded-full bg-green-500/10">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
            )}
            {status === 'error' && (
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertCircle className="h-10 w-10 text-destructive" />
              </div>
            )}
          </div>
          <CardTitle className="text-2xl">
            {status === 'loading' && 'Completing Sign In...'}
            {status === 'success' && 'Sign In Successful!'}
            {status === 'error' && 'Something Went Wrong'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your email...'}
            {status === 'success' && 'Redirecting you now...'}
            {status === 'error' && errorMessage}
          </CardDescription>
        </CardHeader>
        {status === 'error' && (
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground text-center">
              If this problem persists, please try signing in again.
            </p>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Go to Sign In
            </Button>
            <DebugPanel />
          </CardContent>
        )}
        {status === 'loading' && <CardContent><DebugPanel /></CardContent>}
      </Card>
    </div>
  );
}
