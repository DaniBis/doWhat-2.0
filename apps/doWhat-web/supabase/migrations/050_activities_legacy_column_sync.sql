-- Migration 050: Keep legacy activities columns in sync (title/location)
-- Some environments still have a NOT NULL activities.title column from early schema.
-- This trigger copies `name -> title` to keep inserts compatible.

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'title'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'name'
  ) THEN
    CREATE OR REPLACE FUNCTION public.sync_activities_legacy_columns()
    RETURNS TRIGGER AS $sync_legacy$
    BEGIN
      IF (NEW.title IS NULL OR btrim(NEW.title) = '')
        AND NEW.name IS NOT NULL
        AND btrim(NEW.name) <> '' THEN
        NEW.title := NEW.name;
      END IF;

      RETURN NEW;
    END;
    $sync_legacy$ LANGUAGE plpgsql;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE event_object_table = 'activities'
        AND trigger_name = 'trg_activities_sync_legacy_columns'
    ) THEN
      CREATE TRIGGER trg_activities_sync_legacy_columns
        BEFORE INSERT OR UPDATE ON public.activities
        FOR EACH ROW EXECUTE FUNCTION public.sync_activities_legacy_columns();
    END IF;
  END IF;
END $migration$;
