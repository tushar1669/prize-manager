-- Allow masters to read all tournaments via direct SELECT (read-only)
create policy if not exists master_read_all_tournaments
on public.tournaments
for select
to authenticated
using (public.has_role(auth.uid(), 'master'));

-- Ensure typical owner and published read policies remain in place (no-op if already present)
-- (Leave existing policies untouched.)

-- Reload PostgREST cache so policy is immediately visible
notify pgrst, 'reload schema';

-- Verification helper (harmless in migration logs):
-- select policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and tablename = 'tournaments';
