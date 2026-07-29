-- This project's default privileges grant EXECUTE on new public functions
-- directly to anon and authenticated, independently of the PUBLIC grant that
-- 20260729170000 already revoked. Both paths must be closed.
revoke execute on function public.reap_stuck_payment_notifications() from anon, authenticated;
