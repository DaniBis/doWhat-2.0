-- doWhat adoption metrics view tracks Step 0 completion progress ahead of GA.
-- Requires migrations 021 (traits), 031 (user_saved_activities), 035 (user sport profiles), and 037 (reliability pledge).

DROP VIEW IF EXISTS public.dowhat_adoption_metrics;

CREATE VIEW public.dowhat_adoption_metrics AS
WITH trait_goal AS (
  SELECT user_id
  FROM public.user_base_traits
  GROUP BY user_id
  HAVING COUNT(*) >= 5
),
skill_profiles AS (
  SELECT DISTINCT user_id
  FROM public.user_sport_profiles
  WHERE skill_level IS NOT NULL AND LENGTH(BTRIM(skill_level)) > 0
),
sport_step AS (
  SELECT p.id AS user_id
  FROM public.profiles p
  INNER JOIN skill_profiles s ON s.user_id = p.id
  WHERE p.primary_sport IS NOT NULL
    AND p.play_style IS NOT NULL
),
pledge_step AS (
  SELECT id AS user_id
  FROM public.profiles
  WHERE reliability_pledge_ack_at IS NOT NULL
),
fully_ready AS (
  SELECT p.id AS user_id
  FROM public.profiles p
  INNER JOIN skill_profiles s ON s.user_id = p.id
  INNER JOIN trait_goal tg ON tg.user_id = p.id
  WHERE p.primary_sport IS NOT NULL
    AND p.play_style IS NOT NULL
    AND p.reliability_pledge_ack_at IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM public.profiles) AS total_profiles,
  (SELECT COUNT(*) FROM sport_step) AS sport_step_complete_count,
  (SELECT COUNT(*) FROM skill_profiles) AS sport_skill_member_count,
  (SELECT COUNT(*) FROM trait_goal) AS trait_goal_count,
  (SELECT COUNT(*) FROM pledge_step) AS pledge_ack_count,
  (SELECT COUNT(*) FROM fully_ready) AS fully_ready_count,
  (SELECT COUNT(*) FROM public.user_sport_profiles) AS user_sport_profile_rows;

COMMENT ON VIEW public.dowhat_adoption_metrics IS 'Aggregated counts for doWhat onboarding adoption (traits, sport, skill, pledge).';
