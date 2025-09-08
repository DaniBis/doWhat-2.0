-- Database schema updates for user traits and badges system

-- User traits table (behaviors, interests, preferences)
CREATE TABLE IF NOT EXISTS user_traits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trait_type VARCHAR(50) NOT NULL, -- 'behavior', 'interest', 'skill', 'preference'
  trait_name VARCHAR(100) NOT NULL,
  trait_value TEXT, -- optional additional data
  icon VARCHAR(50), -- emoji or icon identifier
  color VARCHAR(20), -- hex color code
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, trait_type, trait_name)
);

-- User badges table (achievements, certifications, etc.)
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type VARCHAR(50) NOT NULL, -- 'achievement', 'certification', 'skill_level', 'participation'
  badge_name VARCHAR(100) NOT NULL,
  badge_description TEXT,
  icon VARCHAR(50), -- emoji or icon identifier
  color VARCHAR(20), -- hex color code
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- for certifications
  metadata JSONB, -- additional badge data
  UNIQUE(user_id, badge_type, badge_name)
);

-- Activity participant matching table (for people filter)
CREATE TABLE IF NOT EXISTS activity_participant_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
  preferred_traits TEXT[], -- array of trait names to match
  preferred_badges TEXT[], -- array of badge names to match
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Extend profiles table with additional fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS personality_traits TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_level VARCHAR(50) DEFAULT 'beginner';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_range VARCHAR(20);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS activity_preferences JSONB DEFAULT '{}';

-- Enable RLS
ALTER TABLE user_traits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_participant_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_traits
CREATE POLICY "Users can view their own traits" ON user_traits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own traits" ON user_traits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own traits" ON user_traits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own traits" ON user_traits
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_badges
CREATE POLICY "Users can view their own badges" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view others' badges in activities" ON user_badges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rsvps r 
      JOIN sessions s ON r.session_id = s.id 
      WHERE r.user_id = auth.uid() AND r.status = 'going'
      AND EXISTS (
        SELECT 1 FROM rsvps r2 
        WHERE r2.session_id = s.id AND r2.user_id = user_badges.user_id
      )
    )
  );

-- System can insert badges (achievements, etc.)
CREATE POLICY "System can manage badges" ON user_badges
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for activity_participant_preferences
CREATE POLICY "Anyone can view activity preferences" ON activity_participant_preferences
  FOR SELECT USING (true);

CREATE POLICY "Activity creators can manage preferences" ON activity_participant_preferences
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM activities a 
      WHERE a.id = activity_id AND a.created_by = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_traits_user_id ON user_traits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_traits_type ON user_traits(trait_type);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_type ON user_badges(badge_type);
CREATE INDEX IF NOT EXISTS idx_activity_preferences_activity_id ON activity_participant_preferences(activity_id);

-- Function to get compatible users for an activity based on traits
CREATE OR REPLACE FUNCTION get_compatible_participants(
  activity_uuid UUID,
  user_uuid UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  user_id UUID,
  compatibility_score INTEGER,
  matching_traits TEXT[],
  matching_badges TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_traits_agg AS (
    SELECT 
      ut.user_id,
      array_agg(ut.trait_name) AS user_trait_names
    FROM user_traits ut
    WHERE ut.user_id != user_uuid
    GROUP BY ut.user_id
  ),
  user_badges_agg AS (
    SELECT 
      ub.user_id,
      array_agg(ub.badge_name) AS user_badge_names
    FROM user_badges ub
    WHERE ub.user_id != user_uuid
    GROUP BY ub.user_id
  ),
  activity_prefs AS (
    SELECT 
      app.preferred_traits,
      app.preferred_badges
    FROM activity_participant_preferences app
    WHERE app.activity_id = activity_uuid
    LIMIT 1
  )
  SELECT 
    COALESCE(uta.user_id, uba.user_id) AS user_id,
    (
      COALESCE(array_length(uta.user_trait_names & ap.preferred_traits, 1), 0) * 2 +
      COALESCE(array_length(uba.user_badge_names & ap.preferred_badges, 1), 0) * 3
    ) AS compatibility_score,
    COALESCE(uta.user_trait_names & ap.preferred_traits, '{}') AS matching_traits,
    COALESCE(uba.user_badge_names & ap.preferred_badges, '{}') AS matching_badges
  FROM activity_prefs ap
  FULL OUTER JOIN user_traits_agg uta ON true
  FULL OUTER JOIN user_badges_agg uba ON uta.user_id = uba.user_id
  WHERE COALESCE(uta.user_id, uba.user_id) IS NOT NULL
  AND (
    array_length(uta.user_trait_names & ap.preferred_traits, 1) > 0 OR
    array_length(uba.user_badge_names & ap.preferred_badges, 1) > 0
  )
  ORDER BY compatibility_score DESC;
END;
$$;

-- =============================
-- PostGIS: Nearby Activities RPC + geom maintenance
-- =============================

-- Ensure PostGIS is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- Keep activities.geom in sync with lat/lng (if present)
CREATE OR REPLACE FUNCTION set_activity_geom_from_lat_lng()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_set_activity_geom ON activities;
CREATE TRIGGER trg_set_activity_geom
BEFORE INSERT OR UPDATE ON activities
FOR EACH ROW EXECUTE FUNCTION set_activity_geom_from_lat_lng();

-- Ensure array columns exist for filtering (as per finalized schema)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_types TEXT[] DEFAULT '{}';
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Backfill existing rows' geom from lat/lng
UPDATE activities
SET geom = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

-- Spatial and array indexes for performance
CREATE INDEX IF NOT EXISTS idx_activities_geom ON activities USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_activities_activity_types ON activities USING GIN (activity_types);
CREATE INDEX IF NOT EXISTS idx_activities_tags ON activities USING GIN (tags);

-- Nearby activities via precise geodesic distance using PostGIS
CREATE OR REPLACE FUNCTION public.activities_nearby(
  lat double precision,
  lng double precision,
  radius_m integer DEFAULT 2000,
  types text[] DEFAULT NULL,
  tags text[] DEFAULT NULL,
  limit_rows integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  venue text,
  lat_out double precision,
  lng_out double precision,
  distance_m double precision
) LANGUAGE sql STABLE AS $$
  WITH p AS (
    SELECT ST_SetSRID(ST_MakePoint(lng, lat), 4326) AS pt
  )
  SELECT a.id,
         a.name,
         a.venue,
         a.lat AS lat_out,
         a.lng AS lng_out,
         ST_DistanceSphere(a.geom, p.pt) AS distance_m
  FROM activities a, p
  WHERE a.geom IS NOT NULL
    AND ST_DWithin(a.geom, p.pt, radius_m)
    AND (types IS NULL OR a.activity_types && types)
    AND (tags IS NULL OR a.tags && tags)
  ORDER BY ST_DistanceSphere(a.geom, p.pt)
  LIMIT limit_rows;
$$;

GRANT EXECUTE ON FUNCTION public.activities_nearby(double precision, double precision, integer, text[], text[], integer)
  TO anon, authenticated;

-- Seed activities around a center (dev helper)
CREATE OR REPLACE FUNCTION public.seed_activities(
  lat double precision,
  lng double precision,
  n integer DEFAULT 12,
  radius_m integer DEFAULT 1500
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  i integer := 0;
  cnt integer := 0;
  la double precision;
  ln double precision;
  meters double precision;
  angle double precision;
  deg_per_m double precision := 1.0/111320.0;
  names text[] := ARRAY[
    'Archery Club','Morning Yoga','Group Run','Tennis Meetup','Climbing Gym',
    'Pickup Soccer','Basketball Court','Community Swim','Cycling Group','Hiking Trailhead',
    'Golf Range','Surf School'
  ];
  nm text;
BEGIN
  IF n < 1 THEN n := 1; END IF;
  IF n > 50 THEN n := 50; END IF;
  IF radius_m < 100 THEN radius_m := 100; END IF;
  IF radius_m > 5000 THEN radius_m := 5000; END IF;

  FOR i IN 1..n LOOP
    nm := names[((i-1) % array_length(names,1)) + 1];
    meters := radius_m * (0.4 + random()*0.6);
    angle := random() * 2 * pi();
    la := lat + (meters * sin(angle)) * deg_per_m;
    ln := lng + (meters * cos(angle)) * deg_per_m / cos(radians(lat));
    BEGIN
      INSERT INTO activities(name, venue, lat, lng, activity_types, tags)
      VALUES (nm, 'Seeded spot', la, ln, ARRAY[nm]::text[], ARRAY['seed'])
      ON CONFLICT DO NOTHING;
      cnt := cnt + 1;
    EXCEPTION WHEN others THEN
      -- ignore per-row errors
      NULL;
    END;
  END LOOP;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_activities(double precision,double precision,integer,integer) TO anon, authenticated;
