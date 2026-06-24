alter table public.tournament_entitlements
  drop constraint if exists tournament_entitlements_source_check;

alter table public.tournament_entitlements
  add constraint tournament_entitlements_source_check
  check (source = any (array[
    'payment'::text,
    'coupon'::text,
    'manual_upi'::text
  ]));
