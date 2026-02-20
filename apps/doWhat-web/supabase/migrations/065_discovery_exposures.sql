-- Migration 065: Discovery exposure logging table for ranking/debug analytics
BEGIN;

CREATE TABLE IF NOT EXISTS public.discovery_exposures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT,
  query JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovery_exposures_created_at
  ON public.discovery_exposures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_exposures_request_id
  ON public.discovery_exposures (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.discovery_exposures ENABLE ROW LEVEL SECURITY;

-- Default deny public access; writes are intended for service-role backend only.
REVOKE ALL ON TABLE public.discovery_exposures FROM anon;
REVOKE ALL ON TABLE public.discovery_exposures FROM authenticated;

COMMIT;
