-- Add age rule flexibility flags
alter table public.rule_config
  add column if not exists allow_missing_dob_for_age boolean default false;

alter table public.rule_config
  add column if not exists max_age_inclusive boolean default true;
