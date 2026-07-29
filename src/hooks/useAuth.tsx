import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<Awaited<ReturnType<typeof supabase.auth.signUp>>>;
  signIn: (email: string, password: string) => Promise<Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>>;
  signOut: () => Promise<Awaited<ReturnType<typeof supabase.auth.signOut>>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Supabase v2 fires an INITIAL_SESSION event synchronously on subscribe,
  // carrying the in-memory session — which is null until the async
  // localStorage restore completes. Clearing `loading` there produced a
  // window of (loading=false, user=null), which ProtectedRoute correctly
  // read as "not signed in" and redirected to /auth -> /dashboard.
  // Root cause of the 26 Jul 2026 /admin redirect. Guardrail M2: only
  // getSession() may clear the INITIAL loading flag. Auth events may update
  // session/user at any time, but may not declare resolution early.
  const initialResolved = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (initialResolved.current) setLoading(false);
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        initialResolved.current = true;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        // getSession failed (network error, corrupt storage, etc.).
        // Clear loading so the app doesn't spin forever. User is null,
        // so ProtectedRoute will redirect to /auth — correct behavior.
        initialResolved.current = true;
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    // Use /auth/callback for proper email confirmation handling
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    // NOTE: user_roles and profiles are auto-created by the handle_new_user trigger
    // No client-side insertion needed

    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signOut = useCallback(async () => {
    return await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signUp, signIn, signOut }),
    [user, session, loading, signUp, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Fail loudly: a silent default would reintroduce a fail-open auth path.
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
