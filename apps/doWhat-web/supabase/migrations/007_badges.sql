-- Migration 007: Normalize badges + endorsements + metrics
-- Safe to run multiple times (IF NOT EXISTS / reversible additions only)

-- 1. Core badges catalog
CREATE TABLE IF NOT EXISTS public.badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  tier INT,
  seasonal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2-5. Legacy user_badges backfill (only if table exists)
DO $$
DECLARE
  has_user_badges BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_badges'
  ) INTO has_user_badges;

  IF NOT has_user_badges THEN
    RAISE NOTICE '[badges] user_badges table missing; skipping legacy backfill steps';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='badge_id'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN badge_id UUID REFERENCES public.badges(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='status'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN status TEXT NOT NULL DEFAULT 'unverified' CHECK (status in ('unverified','verified','expired'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='source'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN source TEXT NOT NULL DEFAULT 'activity' CHECK (source in ('endorsement','activity','behavior','admin','seasonal'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='verified_at'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='expiry_date'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN expiry_date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='user_badges' AND column_name='created_at'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    BEGIN
      UPDATE user_badges SET created_at = earned_at WHERE earned_at IS NOT NULL AND created_at IS NULL;
    EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;

  INSERT INTO public.badges(code, name, category, description)
  SELECT DISTINCT lower(replace(badge_name,' ','_')) AS code,
         badge_name AS name,
         COALESCE(badge_type,'reliability_trust') AS category,
         badge_description AS description
  FROM user_badges ub
  LEFT JOIN badges b ON b.code = lower(replace(ub.badge_name,' ','_'))
  WHERE b.id IS NULL AND ub.badge_name IS NOT NULL
  ON CONFLICT (code) DO NOTHING;

  UPDATE user_badges ub
  SET badge_id = b.id
  FROM badges b
  WHERE ub.badge_id IS NULL AND lower(replace(ub.badge_name,' ','_')) = b.code;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='user_badges' AND indexname='user_badges_user_badge_unique'
  ) THEN
    ALTER TABLE user_badges ADD CONSTRAINT user_badges_user_badge_unique UNIQUE (user_id, badge_id);
  END IF;

  UPDATE user_badges SET status='unverified' WHERE status IS NULL;
END $$;

-- 6. Endorsements table
CREATE TABLE IF NOT EXISTS public.badge_endorsements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  endorser_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(target_user_id, badge_id, endorser_user_id)
);

-- 7. Metrics table
CREATE TABLE IF NOT EXISTS public.user_badge_metrics (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  events_attended INT DEFAULT 0,
  categories_tried INT DEFAULT 0,
  events_on_time INT DEFAULT 0,
  updated_at TIMESTAMPTZ
);

-- 8. Endorsement counts view
CREATE OR REPLACE VIEW public.v_badge_endorsement_counts AS
SELECT target_user_id AS user_id, badge_id, count(*)::int AS endorsements
FROM badge_endorsements
GROUP BY target_user_id, badge_id;

-- 9. RLS policies
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badge_metrics ENABLE ROW LEVEL SECURITY;

-- Allow read of catalog to everyone
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Badges public read') THEN
    CREATE POLICY "Badges public read" ON badges FOR SELECT USING (true);
  END IF;
END $$;

-- Allow users to read their endorsements counts via view implicitly (handled by API + no direct RLS needed on view)

-- 10. Seed baseline badges if not present
INSERT INTO badges(code,name,category,description)
VALUES
  ('consistent','Consistent Participant','reliability_trust','Attends activities regularly'),
  ('curious_explorer','Curious Explorer','growth_development','Tries diverse categories'),
  ('reliable','Reliable','reliability_trust','Shows up on time reliably')
ON CONFLICT (code) DO NOTHING;
-- Badges schema for doWhat
-- Categories as an enum to keep data tidy
do $$ begin
  create type public.badge_category as enum (
    'reliability_trust',
    'emotional_warmth',
    'energy_personality',
    'drive_ambition',
    'thinking_cognitive',
    'communication',
    'social_compatibility',
    'balance_self_management',
    'growth_development',
    'distinctive_traits'
  );
exception when duplicate_object then null; end $$;

-- Catalog of badges
create table if not exists public.badges (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  category public.badge_category not null,
  description text,
  tier int default 1 check(tier >= 1),
  seasonal boolean default false,
  created_at timestamptz default now()
);

-- Endorsements are anonymous to the target user (API only returns counts)
create table if not exists public.badge_endorsements (
  id uuid primary key default uuid_generate_v4(),
  target_user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  endorser_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (target_user_id, badge_id, endorser_user_id)
);

-- User badges and state
do $$ begin
  create type public.badge_status as enum ('unverified','verified','expired');
exception when duplicate_object then null; end $$;

create table if not exists public.user_badges (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  status public.badge_status not null default 'unverified',
  source text not null check (source in ('endorsement','activity','behavior','admin','seasonal')),
  created_at timestamptz default now(),
  verified_at timestamptz,
  expiry_date timestamptz,
  unique (user_id, badge_id)
);

-- Optional metrics to power auto-awards (punctuality, attendance, etc.)
create table if not exists public.user_badge_metrics (
  user_id uuid primary key references public.users(id) on delete cascade,
  events_attended int default 0,
  events_on_time int default 0,
  categories_tried int default 0,
  updated_at timestamptz default now()
);

-- Helpful view: endorsement counts per user+badge
create or replace view public.v_badge_endorsement_counts as
  select target_user_id as user_id, badge_id, count(*)::int as endorsements
  from public.badge_endorsements
  group by 1,2;

-- Seed a minimal set of badges (can be extended in app)
insert into public.badges (code, name, category, description)
values
  ('reliable','Reliable','reliability_trust','Shows up on time and follows through'),
  ('trustworthy','Trustworthy','reliability_trust','Kept commitments and respected boundaries'),
  ('curious_explorer','Curious Explorer','growth_development','Tried multiple new activity categories'),
  ('consistent','Consistent','reliability_trust','Attended events regularly'),
  ('community_builder','Community Builder','distinctive_traits','Fosters community and supports others')
on conflict (code) do nothing;
