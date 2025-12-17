-- Migration 036: Move reliability scoring into Postgres triggers

CREATE OR REPLACE FUNCTION public.reliability_delta_for_status(p_status public.attendance_status)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'attended' THEN 10
    WHEN 'late_cancel' THEN -10
    WHEN 'no_show' THEN -30
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_attendance_reliability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  delta integer;
  applied integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.attendance_status IS NOT DISTINCT FROM OLD.attendance_status THEN
    RETURN NEW;
  END IF;

  delta := public.reliability_delta_for_status(NEW.attendance_status);
  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET reliability_score = LEAST(100, GREATEST(0, COALESCE(reliability_score, 100) + delta))
  WHERE id = NEW.user_id;

  GET DIAGNOSTICS applied = ROW_COUNT;
  IF applied = 0 THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'session_attendees'
      AND trigger_name = 'session_attendance_reliability_trg'
  ) THEN
    DROP TRIGGER session_attendance_reliability_trg ON public.session_attendees;
  END IF;
END $$;

CREATE TRIGGER session_attendance_reliability_trg
AFTER INSERT OR UPDATE OF attendance_status ON public.session_attendees
FOR EACH ROW EXECUTE FUNCTION public.apply_attendance_reliability();
