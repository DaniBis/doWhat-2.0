-- Rollback for migration 029: recreate legacy rsvps table structure (minimal)

CREATE TABLE IF NOT EXISTS public.rsvps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id uuid,
  session_id uuid,
  user_id uuid NOT NULL,
  status text CHECK (status IN ('going','interested','declined')) DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now()
);
