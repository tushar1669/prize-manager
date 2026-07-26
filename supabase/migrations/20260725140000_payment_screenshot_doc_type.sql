-- Add payment_screenshot to the doc_type enum (Phase 2A).
-- bank_statement is already present in the enum from a prior migration.
-- IF NOT EXISTS makes this safe to re-run.

ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'payment_screenshot';
