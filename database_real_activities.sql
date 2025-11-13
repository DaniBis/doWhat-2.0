-- Add some real sample activities and sessions for testing
-- First, let's add some activities if they don't exist
INSERT INTO activities (name, description) VALUES
('Rock Climbing', 'Indoor and outdoor rock climbing sessions'),
('Running', 'Group running sessions in local parks'),
('Yoga', 'Yoga classes for all levels'),
('Cycling', 'Group cycling rides through scenic routes'),
('Swimming', 'Swimming sessions at local pools'),
('Hiking', 'Nature hikes in nearby trails'),
('Soccer', 'Casual soccer games in local fields'),
('Basketball', 'Pick-up basketball games'),
('Tennis', 'Tennis matches and lessons'),
('Golf', 'Golf games and lessons'),
('Skiing', 'Skiing trips and lessons'),
('Surfing', 'Surfing lessons and sessions')
ON CONFLICT (name) DO NOTHING;

-- Add some venues if they don't exist
INSERT INTO venues (name, lat, lng, address) VALUES
('Central Park Recreation Center', 40.7829, -73.9654, '830 5th Ave, New York, NY 10065'),
('Brooklyn Bridge Park', 40.7024, -73.9969, 'Brooklyn, NY 11201'),
('Prospect Park', 40.6602, -73.9690, 'Brooklyn, NY 11225'),
('High Line', 40.7480, -74.0048, 'New York, NY 10011'),
('Battery Park', 40.7033, -74.0170, 'New York, NY 10004'),
('Riverside Park', 40.7947, -73.9753, 'New York, NY 10024'),
('Washington Square Park', 40.7308, -73.9973, 'New York, NY 10012'),
('Bryant Park', 40.7536, -73.9832, 'New York, NY 10018'),
('Madison Square Park', 40.7414, -73.9882, 'New York, NY 10010'),
('Union Square Park', 40.7359, -73.9911, 'New York, NY 10003')
ON CONFLICT (name) DO NOTHING;

-- Create or replace the sessions_nearby function for fetching nearby activities
CREATE OR REPLACE FUNCTION sessions_nearby(
  lat DOUBLE PRECISION DEFAULT NULL,
  lng DOUBLE PRECISION DEFAULT NULL,
  p_km INTEGER DEFAULT 25,
  activities TEXT[] DEFAULT NULL,
  day DATE DEFAULT NULL
)
RETURNS TABLE (
  session_id BIGINT,
  activity_id BIGINT,
  activity_name TEXT,
  venue_name TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  price_cents INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE SQL
AS $$
  SELECT 
    s.id as session_id,
    a.id as activity_id,
    a.name as activity_name,
    v.name as venue_name,
    s.starts_at,
    s.ends_at,
    s.price_cents,
    CASE 
      WHEN lat IS NOT NULL AND lng IS NOT NULL AND v.lat IS NOT NULL AND v.lng IS NOT NULL
      THEN round(
        cast(
          6371 * acos(
            cos(radians(lat)) * cos(radians(v.lat)) *
            cos(radians(v.lng) - radians(lng)) +
            sin(radians(lat)) * sin(radians(v.lat))
          ) as numeric
        ), 2
      )
      ELSE NULL
    END as distance_km
  FROM sessions s
  JOIN activities a ON s.activity_id = a.id
  JOIN venues v ON s.venue_id = v.id
  WHERE 
    s.starts_at > NOW()
    AND (day IS NULL OR DATE(s.starts_at) = day)
    AND (activities IS NULL OR a.name = ANY(activities))
    AND (
      lat IS NULL OR lng IS NULL OR v.lat IS NULL or v.lng IS NULL OR
      6371 * acos(
        cos(radians(lat)) * cos(radians(v.lat)) *
        cos(radians(v.lng) - radians(lng)) +
        sin(radians(lat)) * sin(radians(v.lat))
      ) <= p_km
    )
  ORDER BY 
    CASE 
      WHEN lat IS NOT NULL AND lng IS NOT NULL AND v.lat IS NOT NULL AND v.lng IS NOT NULL
      THEN 6371 * acos(
        cos(radians(lat)) * cos(radians(v.lat)) *
        cos(radians(v.lng) - radians(lng)) +
        sin(radians(lat)) * sin(radians(v.lat))
      )
      ELSE 0
    END ASC,
    s.starts_at ASC
  LIMIT 50;
$$;

-- Add some sample sessions for testing
INSERT INTO sessions (activity_id, venue_id, starts_at, ends_at, price_cents) 
SELECT 
  a.id,
  v.id,
  NOW() + INTERVAL '1 day' + (INTERVAL '1 hour' * (random() * 24)::int),
  NOW() + INTERVAL '1 day' + (INTERVAL '1 hour' * (random() * 24)::int) + INTERVAL '2 hours',
  (random() * 5000)::int + 500  -- Random price between $5-55
FROM activities a
CROSS JOIN venues v
WHERE random() < 0.3  -- Only create sessions for 30% of combinations
AND NOT EXISTS (
  SELECT 1 FROM sessions s2 
  WHERE s2.activity_id = a.id 
  AND s2.venue_id = v.id
)
LIMIT 20;

-- Grant permissions
GRANT EXECUTE ON FUNCTION sessions_nearby TO authenticated;
GRANT EXECUTE ON FUNCTION sessions_nearby TO anon;
