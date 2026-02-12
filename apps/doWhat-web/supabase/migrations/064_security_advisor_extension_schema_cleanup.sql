-- Migration 064: Move extensions out of `public` (Security Advisor warnings)
-- Supabase best practice is to keep extensions in the dedicated `extensions` schema.
-- This migration relocates extensions when possible, and reinstalls non-relocatable ones.

-- Ensure schema exists (support-created in some projects; safe if already present).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE SCHEMA extensions;
  END IF;
END $$;

-- Ensure runtime roles can resolve extension types/functions via search_path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA extensions TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA extensions TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA extensions TO service_role;
  END IF;
END $$;

-- Relocate relocatable extensions that are currently installed in `public`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'cube'
      AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION cube SET SCHEMA extensions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'earthdistance'
      AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION earthdistance SET SCHEMA extensions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector'
      AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
  END IF;
END $$;

-- pg_net does not support `ALTER EXTENSION ... SET SCHEMA` in Supabase.
-- Reinstall it in `extensions` to clear "Extension in Public" warnings.
DO $$
DECLARE
  paused_job_ids int[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net'
      AND n.nspname <> 'extensions'
  ) THEN
    -- Pause cron jobs that call `net.http_*` to avoid transient failures while pg_net is dropped.
    BEGIN
      SELECT array_agg(jobid)
      INTO paused_job_ids
      FROM cron.job
      WHERE active IS TRUE
        AND command ILIKE '%net.http_%';

      IF paused_job_ids IS NOT NULL THEN
        UPDATE cron.job
        SET active = FALSE
        WHERE jobid = ANY(paused_job_ids);
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        paused_job_ids := NULL;
      WHEN undefined_column THEN
        paused_job_ids := NULL;
      WHEN insufficient_privilege THEN
        paused_job_ids := NULL;
    END;

    DROP EXTENSION pg_net;
    CREATE EXTENSION pg_net WITH SCHEMA extensions;

    -- Restore paused cron jobs (only those that were active before).
    BEGIN
      IF paused_job_ids IS NOT NULL THEN
        UPDATE cron.job
        SET active = TRUE
        WHERE jobid = ANY(paused_job_ids);
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
      WHEN undefined_column THEN
        NULL;
      WHEN insufficient_privilege THEN
        NULL;
    END;
  END IF;
END $$;
