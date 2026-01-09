-- Migration 051: Add reliability/verification columns used by map APIs
BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reliability_score integer,
  ADD COLUMN IF NOT EXISTS verification_confirmations integer,
  ADD COLUMN IF NOT EXISTS verification_required integer;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reliability_score integer;

UPDATE public.events
SET verification_confirmations = 0
WHERE verification_confirmations IS NULL;

UPDATE public.events
SET verification_required = 0
WHERE verification_required IS NULL;

COMMIT;

