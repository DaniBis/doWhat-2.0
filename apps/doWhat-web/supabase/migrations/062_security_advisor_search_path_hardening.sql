-- Migration 062: Security Advisor search_path hardening
-- Ensure public functions explicitly set search_path so Supabase Security Advisor
-- no longer flags them as "Function Search Path Mutable".

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_temp',
        fn.schema_name,
        fn.function_name,
        fn.identity_args
      );
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping function %.%(%) due to insufficient privileges',
          fn.schema_name,
          fn.function_name,
          fn.identity_args;
    END;
  END LOOP;
END $$;
