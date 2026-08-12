-- F1-A2: close the direct client write path into public.profiles.
--
-- Verified prerequisite: the app now writes exclusively through
-- public.update_my_profile() (production HAR, 12 Aug 2026: preflight POST to
-- rpc/update_my_profile, zero PATCH/POST to /rest/v1/profiles).
--
-- Why this matters: profiles had RLS but no column-level grants, so an
-- ordinary organizer could UPDATE profile_reward_claimed = false and re-mint a
-- 100%-off tournament_pro coupon via claim_profile_completion_reward(),
-- unbounded. Negative-tested as 753b536b on 12 Aug: 1 row updated, flag flipped.
-- Same failure shape as D25/D29 on extractions: RLS restricts rows, never columns.

-- 1. Remove every write privilege. Both roles, explicitly (D18/N1: the PUBLIC
--    path and the direct role grants are independent).
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon;

-- 2. anon has no legitimate read of profiles: both SELECT policies resolve to
--    zero rows for an unauthenticated caller (id = auth.uid() is NULL;
--    is_master() is false). Note: public.profile_completion is a
--    security_invoker view over this table, so anon SELECT on it will now error
--    rather than return zero rows. Verified 12 Aug: no code path queries that
--    view. authenticated retains SELECT, so the view still works when logged in.
revoke select on public.profiles from anon;

-- 3. Close the RLS layer too. With no UPDATE grant this policy is already
--    inert, but leaving it means a future re-grant silently reopens the hole.
--    Dropping it makes the table fail closed by default (D29: both layers
--    close together or neither closes).
drop policy if exists users_update_own_profile on public.profiles;

-- Deliberately NOT touched:
--   - authenticated SELECT: Account page, admin surfaces, martech hooks all read.
--   - handle_new_user(), claim_profile_completion_reward(), update_my_profile():
--     all SECURITY DEFINER, so they run as owner and are unaffected.
--   - service_role: edge functions must keep full access.

notify pgrst, 'reload schema';
