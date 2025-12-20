import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type CallbackStatus = 'loading' | 'success' | 'error' | 'expired';

/**
 * AuthCallback handles email confirmation redirects from Supabase.
 * Supports:
 * - PKCE flow: URL contains ?code=...
 * - Hash token flow: URL hash contains access_token/refresh_token
 * - Error params: URL contains ?error=...
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flowType, setFlowType] = useState<string>('unknown');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log incoming params for debugging
        const code = searchParams.get('code');
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        console.log('[auth-callback] Params detected:', {
          hasCode: !!code,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasError: !!errorParam,
          fullUrl: window.location.href
        });

        // Case 1: Error in URL params (e.g., expired link)
        if (errorParam) {
          console.error('[auth-callback] URL error:', errorParam, errorDescription);
          const message = errorDescription || errorParam;
          
          // Check for common expired/invalid link errors
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

        // Case 2: PKCE flow - URL has ?code=...
        if (code) {
          setFlowType('pkce');
          console.log('[auth-callback] PKCE flow: exchanging code for session');
          toast.info('Verifying your email...');
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('[auth-callback] PKCE exchange error:', error);
            
            // Check for expired code
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
          
          console.log('[auth-callback] PKCE exchange successful, user:', data.user?.email);
          toast.success('Email verified successfully!');
          setStatus('success');
          
          // Redirect based on user verification status
          await redirectAfterAuth();
          return;
        }

        // Case 3: Hash token flow - URL hash contains tokens
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
          
          console.log('[auth-callback] Session set successfully, user:', data.user?.email);
          toast.success('Signed in successfully!');
          setStatus('success');
          
          await redirectAfterAuth();
          return;
        }

        // Case 4: No auth parameters - check if already authenticated
        setFlowType('existing-session');
        console.log('[auth-callback] No auth params, checking existing session');
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[auth-callback] Already authenticated:', session.user.email);
          setStatus('success');
          toast.success('Already signed in');
          await redirectAfterAuth();
          return;
        }

        // No tokens found and not authenticated
        console.warn('[auth-callback] No auth tokens and no existing session');
        setFlowType('missing');
        setStatus('expired');
        setErrorMessage('No authentication data found. The link may have expired or already been used.');
        toast.error('Please sign in again');
        
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
      // Small delay to ensure session is fully set
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check user role to determine where to redirect
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Check if user is verified organizer or master
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, is_verified')
        .eq('user_id', user.id)
        .single();

      console.log('[auth-callback] User role data:', roleData);

      if (roleData?.role === 'master' || roleData?.is_verified) {
        // Verified users go to dashboard
        console.log('[auth-callback] Redirecting verified user to dashboard');
        navigate('/dashboard', { replace: true });
      } else {
        // Unverified organizers go to pending approval
        console.log('[auth-callback] Redirecting unverified user to pending-approval');
        navigate('/pending-approval', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  // Friendly UI for expired links
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
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Don't worry! You can request a new confirmation email or sign in if you've already verified your account.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate('/auth')} className="w-full">
                Go to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          </CardContent>
        )}
      </Card>
    </div>
  );
}
