-- Add missing description column to sessions table
ALTER TABLE sessions ADD COLUMN description TEXT;

-- Update existing sessions to have null descriptions (they can be updated later)
-- This ensures existing data remains intact

-- Grant permissions for the description column
-- (Permissions should be inherited from table-level policies)

-- Add some sample descriptions to existing sessions
UPDATE sessions SET description = 'A great ' || 
  CASE 
    WHEN activity_id IN (SELECT id FROM activities WHERE name = 'Running') THEN 'running session for fitness enthusiasts'
    WHEN activity_id IN (SELECT id FROM activities WHERE name = 'Rock Climbing') THEN 'climbing session for adventure seekers'
    WHEN activity_id IN (SELECT id FROM activities WHERE name = 'Yoga') THEN 'yoga session for relaxation and mindfulness'
    WHEN activity_id IN (SELECT id FROM activities WHERE name = 'Cycling') THEN 'cycling session for outdoor enthusiasts'
    ELSE 'activity session for community members'
  END
WHERE description IS NULL;
