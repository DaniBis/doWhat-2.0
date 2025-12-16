-- Migration 034a: Extend attendance_status enum for doWhat work.
-- Ensures new statuses exist (and are committed) before later migrations rely on them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'attendance_status'
  ) THEN
    CREATE TYPE public.attendance_status AS ENUM (
      'attended',
      'no_show',
      'cancelled',
      'excused',
      'registered',
      'late_cancel'
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'attendance_status' AND e.enumlabel = 'registered'
    ) THEN
      ALTER TYPE public.attendance_status ADD VALUE 'registered';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'attendance_status' AND e.enumlabel = 'late_cancel'
    ) THEN
      ALTER TYPE public.attendance_status ADD VALUE 'late_cancel';
    END IF;
  END IF;
END $$;
