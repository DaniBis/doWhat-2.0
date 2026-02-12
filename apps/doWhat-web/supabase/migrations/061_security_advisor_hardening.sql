-- Migration 061: Supabase Security Advisor hardening
-- Addresses exposed-view and function advisories surfaced in Security Advisor.

-- Prefer invoker rights for public views exposed through PostgREST.
ALTER VIEW IF EXISTS public.v_venue_activity_votes SET (security_invoker = true);
ALTER VIEW IF EXISTS public.v_venue_activity_scores SET (security_invoker = true);
ALTER VIEW IF EXISTS public.dowhat_adoption_metrics SET (security_invoker = true);
ALTER VIEW IF EXISTS public.social_sweat_adoption_metrics SET (security_invoker = true);
-- Back-compat for earlier typo (kept idempotent in case the view exists).
ALTER VIEW IF EXISTS public.social_sweet_adoption_metrics SET (security_invoker = true);

-- Lock trigger helper functions to a deterministic search_path.
CREATE OR REPLACE FUNCTION public.touch_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_event_sources_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_venue_activity_votes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- public.spatial_ref_sys is extension-owned and exposed via PostgREST in `public`.
-- Enabling RLS with read-only policy satisfies advisor checks while preserving reads.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'spatial_ref_sys'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping RLS enable on public.spatial_ref_sys due to insufficient privileges';
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'spatial_ref_sys'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'spatial_ref_sys'
        AND policyname = 'spatial_ref_sys_read_only'
    ) THEN
      BEGIN
        CREATE POLICY spatial_ref_sys_read_only
          ON public.spatial_ref_sys
          FOR SELECT
          USING (TRUE);
      EXCEPTION
        WHEN insufficient_privilege THEN
          RAISE NOTICE 'Skipping policy creation on public.spatial_ref_sys due to insufficient privileges';
      END;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    BEGIN
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys FROM anon';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping DML revoke for role anon on public.spatial_ref_sys due to insufficient privileges';
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    BEGIN
      EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys FROM authenticated';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping DML revoke for role authenticated on public.spatial_ref_sys due to insufficient privileges';
    END;
  END IF;
END $$;
