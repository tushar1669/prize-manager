-- 20260729150000 revoked from anon/authenticated, which held no direct grant.
-- PUBLIC is the actual holder. Revoke there, then re-grant only what is needed.
revoke execute on function public.enqueue_payment_notification() from public;
grant  execute on function public.enqueue_payment_notification() to postgres, service_role;
