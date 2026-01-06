-- Migration 025: ensure venues metadata column exists for enrichment features
ALTER TABLE IF EXISTS public.venues
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;
