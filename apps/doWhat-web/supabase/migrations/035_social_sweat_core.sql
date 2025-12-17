-- Migration 035: doWhat core scaffolding
create extension if not exists "pgcrypto";

-- Ensure enums exist before adding typed columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'play_style'
  ) THEN
    CREATE TYPE public.play_style AS ENUM ('competitive', 'fun');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'sport_type'
  ) THEN
    CREATE TYPE public.sport_type AS ENUM ('padel', 'climbing', 'running', 'other');
  END IF;
END $$;

-- Profile enrichment for reliability + sport preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reliability_score integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS primary_sport public.sport_type,
  ADD COLUMN IF NOT EXISTS play_style public.play_style,
  ADD COLUMN IF NOT EXISTS availability_window jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Keep trait taxonomy flexible
ALTER TABLE public.user_traits
  ADD COLUMN IF NOT EXISTS trait_category text NOT NULL DEFAULT 'vibe';

-- Activity sport typing
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS sport_type public.sport_type NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS activities_sport_type_idx ON public.activities(sport_type);

-- Attendance-level reliability tracking
ALTER TABLE public.session_attendees
  ADD COLUMN IF NOT EXISTS attendance_status public.attendance_status NOT NULL DEFAULT 'registered';

UPDATE public.session_attendees
SET attendance_status = CASE status
  WHEN 'going' THEN 'registered'
  WHEN 'interested' THEN 'registered'
  WHEN 'declined' THEN 'late_cancel'
  ELSE attendance_status
END;

CREATE INDEX IF NOT EXISTS session_attendees_attendance_status_idx
  ON public.session_attendees(attendance_status);

-- User sport profile breakout (prevents trait overload)
CREATE TABLE IF NOT EXISTS public.user_sport_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  sport public.sport_type NOT NULL,
  skill_level text,
  years_experience integer CHECK (years_experience IS NULL OR years_experience >= 0),
  preferred_time jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_sport_profiles_user_sport_key
  ON public.user_sport_profiles(user_id, sport);

-- Open slot table to advertise extra players
CREATE TABLE IF NOT EXISTS public.session_open_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  required_skill_level text,
  slots_count integer NOT NULL CHECK (slots_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS session_open_slots_session_id_key
  ON public.session_open_slots(session_id);

CREATE INDEX IF NOT EXISTS session_open_slots_slots_count_idx
  ON public.session_open_slots(slots_count);

-- Shared trigger helper for updated_at columns
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'session_open_slots'
      AND trigger_name = 'trg_session_open_slots_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_session_open_slots_set_updated_at
      BEFORE UPDATE ON public.session_open_slots
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'user_sport_profiles'
      AND trigger_name = 'trg_user_sport_profiles_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_sport_profiles_set_updated_at
      BEFORE UPDATE ON public.user_sport_profiles
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

-- RLS for new tables
ALTER TABLE public.session_open_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sport_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'session_open_slots_public_select'
      AND tablename = 'session_open_slots'
  ) THEN
    CREATE POLICY session_open_slots_public_select
      ON public.session_open_slots
      FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'session_open_slots_host_insert'
      AND tablename = 'session_open_slots'
  ) THEN
    CREATE POLICY session_open_slots_host_insert
      ON public.session_open_slots
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.sessions s
          WHERE s.id = session_open_slots.session_id
            AND s.host_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'session_open_slots_host_update'
      AND tablename = 'session_open_slots'
  ) THEN
    CREATE POLICY session_open_slots_host_update
      ON public.session_open_slots
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.sessions s
          WHERE s.id = session_open_slots.session_id
            AND s.host_user_id = auth.uid()
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.sessions s
          WHERE s.id = session_open_slots.session_id
            AND s.host_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'session_open_slots_host_delete'
      AND tablename = 'session_open_slots'
  ) THEN
    CREATE POLICY session_open_slots_host_delete
      ON public.session_open_slots
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.sessions s
          WHERE s.id = session_open_slots.session_id
            AND s.host_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'user_sport_profiles_self_select'
      AND tablename = 'user_sport_profiles'
  ) THEN
    CREATE POLICY user_sport_profiles_self_select
      ON public.user_sport_profiles
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'user_sport_profiles_self_write'
      AND tablename = 'user_sport_profiles'
  ) THEN
    CREATE POLICY user_sport_profiles_self_write
      ON public.user_sport_profiles
      FOR ALL USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
