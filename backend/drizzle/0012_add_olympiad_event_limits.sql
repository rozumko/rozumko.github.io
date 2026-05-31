-- Migration 0012: configurable olympiad duration and question count.
-- The SQL is idempotent because the production database received these columns
-- manually before this migration file was added to the Drizzle history.

ALTER TABLE public.olympiad_events
  ADD COLUMN IF NOT EXISTS time_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS questions_count integer NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'olympiad_events_time_minutes_range'
      AND conrelid = 'public.olympiad_events'::regclass
  ) THEN
    ALTER TABLE public.olympiad_events
      ADD CONSTRAINT olympiad_events_time_minutes_range
      CHECK (time_minutes BETWEEN 1 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'olympiad_events_questions_count_range'
      AND conrelid = 'public.olympiad_events'::regclass
  ) THEN
    ALTER TABLE public.olympiad_events
      ADD CONSTRAINT olympiad_events_questions_count_range
      CHECK (questions_count BETWEEN 1 AND 100);
  END IF;
END
$$;
