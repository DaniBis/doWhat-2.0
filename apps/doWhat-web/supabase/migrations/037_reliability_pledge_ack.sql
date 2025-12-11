-- Migration 037: Track reliability pledge acknowledgements
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reliability_pledge_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS reliability_pledge_version text;
