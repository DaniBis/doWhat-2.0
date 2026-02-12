-- Migration 063: Security Advisor follow-up (missed view hardening)
-- Ensure adoption-metrics views exposed via PostgREST use invoker rights.

-- Correct view name (Security Advisor currently flags this one).
ALTER VIEW IF EXISTS public.social_sweat_adoption_metrics SET (security_invoker = true);

-- Back-compat for the earlier typo in migration 061.
ALTER VIEW IF EXISTS public.social_sweet_adoption_metrics SET (security_invoker = true);

