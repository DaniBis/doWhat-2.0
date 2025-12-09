-- Migration 024: Smart Activity Discovery foundation
-- Adds AI enrichment columns, provider caches, vote tracking, and helper views/functions
-- for ranking and verification workflows.

-- 1. Extend venues table with enrichment columns ---------------------------------
ALTER TABLE IF EXISTS public.venues
  ADD COLUMN IF NOT EXISTS raw_description TEXT,
  ADD COLUMN IF NOT EXISTS raw_reviews TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_activity_tags TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_confidence_scores JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS verified_activities TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS last_ai_update TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_verification BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Provider cache tables -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foursquare_cache (
  fsq_id TEXT PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_foursquare_cache_expires
  ON public.foursquare_cache (expires_at);

CREATE TABLE IF NOT EXISTS public.google_places_cache (
  place_id TEXT PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_google_places_cache_expires
  ON public.google_places_cache (expires_at);

-- 3. User verification votes -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_activity_votes (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_name TEXT NOT NULL CHECK (activity_name <> ''),
  vote BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue_id, user_id, activity_name)
);

CREATE INDEX IF NOT EXISTS idx_venue_activity_votes_venue_activity
  ON public.venue_activity_votes (venue_id, activity_name);

CREATE OR REPLACE FUNCTION public.touch_venue_activity_votes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'venue_activity_votes' AND trigger_name = 'trg_venue_activity_votes_set_updated'
  ) THEN
    CREATE TRIGGER trg_venue_activity_votes_set_updated
    BEFORE UPDATE ON public.venue_activity_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_venue_activity_votes_updated_at();
  END IF;
END $$;

ALTER TABLE public.venue_activity_votes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venue_activity_votes' AND policyname = 'venue_votes_public_read'
  ) THEN
    CREATE POLICY venue_votes_public_read ON public.venue_activity_votes
      FOR SELECT USING (TRUE);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venue_activity_votes' AND policyname = 'venue_votes_owner_mutate'
  ) THEN
    CREATE POLICY venue_votes_owner_mutate ON public.venue_activity_votes
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Aggregated vote view --------------------------------------------------------
CREATE OR REPLACE VIEW public.v_venue_activity_votes AS
SELECT
  venue_id,
  activity_name,
  SUM(CASE WHEN vote THEN 1 ELSE 0 END)::INT AS yes_votes,
  SUM(CASE WHEN NOT vote THEN 1 ELSE 0 END)::INT AS no_votes
FROM public.venue_activity_votes
GROUP BY venue_id, activity_name;

-- 5. Helper function to refresh verified_activities ------------------------------
CREATE OR REPLACE FUNCTION public.refresh_verified_activities(target_venue UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  verified TEXT[] := ARRAY[]::TEXT[];
  needs_review BOOLEAN := FALSE;
  rec RECORD;
BEGIN
  PERFORM 1 FROM public.venues WHERE id = target_venue FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(verified_activities, '{}'::TEXT[]) INTO verified
  FROM public.venues WHERE id = target_venue;

  FOR rec IN
    SELECT activity_name,
           SUM(CASE WHEN vote THEN 1 ELSE 0 END) AS yes_votes,
           SUM(CASE WHEN NOT vote THEN 1 ELSE 0 END) AS no_votes
    FROM public.venue_activity_votes
    WHERE venue_id = target_venue
    GROUP BY activity_name
  LOOP
    IF rec.yes_votes >= 3 AND rec.no_votes = 0 THEN
      verified := ARRAY(SELECT DISTINCT unnest(verified || rec.activity_name));
    ELSIF rec.no_votes >= 3 AND rec.yes_votes = 0 THEN
      verified := ARRAY(SELECT DISTINCT unnest(ARRAY_REMOVE(verified, rec.activity_name)));
    ELSE
      needs_review := TRUE;
    END IF;
  END LOOP;

  UPDATE public.venues
  SET
    verified_activities = COALESCE(verified, '{}'::TEXT[]),
    needs_verification = needs_review
  WHERE id = target_venue;
END;
$$;

-- Optional: expose ranking-ready view (basic metadata + votes + ai scores)
CREATE OR REPLACE VIEW public.v_venue_activity_scores AS
SELECT
  v.id AS venue_id,
  v.name,
  v.lat,
  v.lng,
  v.ai_activity_tags,
  v.ai_confidence_scores,
  v.verified_activities,
  v.needs_verification,
  vv.activity_name,
  COALESCE(vv.yes_votes, 0) AS yes_votes,
  COALESCE(vv.no_votes, 0) AS no_votes
FROM public.venues v
LEFT JOIN public.v_venue_activity_votes vv ON vv.venue_id = v.id;

-- End migration 024.
