-- Phase J / B-5: pg_cron reaper for stuck extraction_documents.
--
-- Uploads move through the transient states 'pending' (set on upload) and 'processing'
-- (set by the extract function). If the extract call dies mid-flight — a crashed worker,
-- a dropped connection, a timeout the function never recovers from — the row is orphaned
-- in one of those states forever and the review queue never surfaces a terminal outcome.
-- This job sweeps rows older than 10 minutes still stuck in a transient state into 'error',
-- the same terminal/failure status the extract function writes on its own error paths.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION expire_stuck_extraction_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE extraction_documents
  SET status = 'error'
  WHERE status IN ('pending', 'processing')
    AND created_at < NOW() - INTERVAL '10 minutes';
END;
$$;

-- Idempotent scheduling: unschedule a prior definition of this job before (re)creating it,
-- so re-running the migration never stacks duplicate cron entries.
SELECT cron.unschedule('expire-stuck-extraction-documents')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-stuck-extraction-documents'
);

SELECT cron.schedule(
  'expire-stuck-extraction-documents',
  '*/10 * * * *',
  'SELECT expire_stuck_extraction_documents()'
);
