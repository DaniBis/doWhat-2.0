-- 060_sessions_place_label_finalize.sql

WITH src AS (
  SELECT
    s.id,
    COALESCE(
      NULLIF(BTRIM(p.name), ''),
      NULLIF(BTRIM(a.place_label), ''),
      'Unknown location'
    ) AS new_label
  FROM public.sessions AS s
  LEFT JOIN public.places AS p ON p.id = s.place_id
  LEFT JOIN public.activities AS a ON a.id = s.activity_id
  WHERE s.place_label IS NULL OR BTRIM(s.place_label) = ''
)
UPDATE public.sessions AS s
SET place_label = src.new_label
FROM src
WHERE src.id = s.id;

DO $$
DECLARE
  missing_count BIGINT;
  is_nullable TEXT;
  constraint_exists BOOLEAN;
  constraint_validated BOOLEAN;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM public.sessions
  WHERE place_label IS NULL OR BTRIM(place_label) = '';

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'sessions.place_label still has % null/blank rows; aborting NOT NULL enforcement.', missing_count;
  END IF;

  SELECT is_nullable
  INTO is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'sessions'
    AND column_name = 'place_label'
  LIMIT 1;

  IF is_nullable = 'YES' THEN
    ALTER TABLE public.sessions
      ALTER COLUMN place_label SET NOT NULL;
  END IF;

  SELECT EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conrelid = 'public.sessions'::regclass
             AND conname = 'sessions_place_label_nonempty'
         ),
         EXISTS (
           SELECT 1
           FROM pg_constraint
           WHERE conrelid = 'public.sessions'::regclass
             AND conname = 'sessions_place_label_nonempty'
             AND convalidated
         )
  INTO constraint_exists, constraint_validated;

  IF NOT constraint_exists THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_place_label_nonempty
      CHECK (BTRIM(place_label) <> '');
  END IF;

  IF constraint_exists AND NOT constraint_validated THEN
    ALTER TABLE public.sessions
      VALIDATE CONSTRAINT sessions_place_label_nonempty;
  END IF;
END
$$;

-- Verification (run manually)
-- select count(*) from public.sessions where place_label is null or btrim(place_label) = '';
-- select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'sessions' and column_name = 'place_label';
-- select conname, convalidated from pg_constraint where conrelid = 'public.sessions'::regclass and conname = 'sessions_place_label_nonempty';
