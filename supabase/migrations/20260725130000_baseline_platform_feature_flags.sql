-- BASELINE: public.platform_feature_flags
-- Created live in Supabase. Captures DDL for version control.

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
  key          text         PRIMARY KEY,
  enabled      boolean      NOT NULL DEFAULT false,
  description  text,
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  updated_by   uuid
);

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

-- No RLS policies found on live DB
