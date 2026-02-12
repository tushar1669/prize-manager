-- Disable all self-serve master bootstrap paths.

-- Remove any policy that permits client-side insertion of role='master'.
DROP POLICY IF EXISTS "allowlist_bootstrap_master" ON public.user_roles;
DROP POLICY IF EXISTS "bootstrap_first_master_insert" ON public.user_roles;
DROP POLICY IF EXISTS "bootstrap_first_master_update" ON public.user_roles;

-- Ensure bootstrap RPC cannot be called from client roles.
REVOKE EXECUTE ON FUNCTION public.bootstrap_master() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_master() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_master() FROM public;
