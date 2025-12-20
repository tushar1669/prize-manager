import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

/**
 * AuthCallback handles email confirmation redirects from Supabase.
 * Supports:
 * - PKCE flow: URL contains ?code=...
 * - Hash token flow: URL hash contains access_token/refresh_token
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Case 1: PKCE flow - URL has ?code=...
        const code = searchParams.get('code');
        if (code) {
          console.log('[auth-callback] Exchanging PKCE code for session');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[auth-callback] PKCE exchange error:', error);
            setErrorMessage(error.message);
            setStatus('error');
            return;
          }
          console.log('[auth-callback] PKCE exchange successful');
          setStatus('success');
          // Small delay to ensure session is set
          setTimeout(() => navigate('/dashboard', { replace: true }), 500);
          return;
        }

        // Case 2: Hash token flow - URL hash contains tokens
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          console.log('[auth-callback] Setting session from hash tokens');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.error('[auth-callback] Set session error:', error);
            setErrorMessage(error.message);
            setStatus('error');
            return;
          }
          console.log('[auth-callback] Session set successfully');
          setStatus('success');
          setTimeout(() => navigate('/dashboard', { replace: true }), 500);
          return;
        }

        // Case 3: Check if error in URL params
        const errorParam = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        if (errorParam) {
          console.error('[auth-callback] URL error:', errorParam, errorDescription);
          setErrorMessage(errorDescription || errorParam);
          setStatus('error');
          return;
        }

        // Case 4: No auth parameters - check if already authenticated
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[auth-callback] Already authenticated, redirecting');
          setStatus('success');
          setTimeout(() => navigate('/dashboard', { replace: true }), 500);
          return;
        }

        // No tokens found and not authenticated
        console.warn('[auth-callback] No auth tokens found in URL');
        setErrorMessage('No authentication tokens found. Please try signing in again.');
        setStatus('error');
      } catch (err) {
        console.error('[auth-callback] Unexpected error:', err);
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

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
            {status === 'error' && 'Sign In Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we verify your email...'}
            {status === 'success' && 'Redirecting you to the dashboard...'}
            {status === 'error' && errorMessage}
          </CardDescription>
        </CardHeader>
        {status === 'error' && (
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate('/auth')}>
              Go to Sign In
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
