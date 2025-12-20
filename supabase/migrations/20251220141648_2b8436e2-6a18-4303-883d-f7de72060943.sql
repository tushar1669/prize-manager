-- Allow master to delete user_roles (for rejection)
DROP POLICY IF EXISTS "master_delete_roles" ON public.user_roles;
CREATE POLICY "master_delete_roles" ON public.user_roles
  FOR DELETE USING (public.is_master());