-- Migration 0047: class activities in School Mode.
-- A session now delivers either server-graded questions (default, unchanged)
-- or a procedural activity whose result the browser reports.

ALTER TABLE public.school_sessions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'questions',
  ADD COLUMN IF NOT EXISTS activity_key text,
  ADD COLUMN IF NOT EXISTS activity_level text;

ALTER TABLE public.school_sessions
  DROP CONSTRAINT IF EXISTS school_sessions_kind_check,
  ADD CONSTRAINT school_sessions_kind_check
    CHECK (kind IN ('questions', 'activity')),
  -- Fail-closed pairing: an activity session must name its activity, and a
  -- question session must not carry activity columns at all.
  DROP CONSTRAINT IF EXISTS school_sessions_activity_pairing_check,
  ADD CONSTRAINT school_sessions_activity_pairing_check
    CHECK (
      (kind = 'activity'  AND activity_key IS NOT NULL AND activity_level IS NOT NULL)
      OR
      (kind = 'questions' AND activity_key IS NULL     AND activity_level IS NULL)
    );

CREATE TABLE IF NOT EXISTS public.school_activity_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.school_participants(id) ON DELETE CASCADE,
  activity_key   text NOT NULL,
  activity_level text NOT NULL,
  correct        integer NOT NULL,
  total          integer NOT NULL,
  mistakes       integer NOT NULL DEFAULT 0,
  duration_sec   integer NOT NULL,
  stars          integer NOT NULL,
  trust          text NOT NULL DEFAULT 'client-unverified',
  finished_at    timestamptz DEFAULT now()
);

ALTER TABLE public.school_activity_results
  DROP CONSTRAINT IF EXISTS school_activity_results_participant_uq,
  ADD CONSTRAINT school_activity_results_participant_uq UNIQUE (participant_id);

-- Browser-reported evidence is never certified; the column exists so the
-- provenance travels with the row instead of living only in code comments.
ALTER TABLE public.school_activity_results
  DROP CONSTRAINT IF EXISTS school_activity_results_trust_check,
  ADD CONSTRAINT school_activity_results_trust_check
    CHECK (trust = 'client-unverified'),
  DROP CONSTRAINT IF EXISTS school_activity_results_range_check,
  ADD CONSTRAINT school_activity_results_range_check
    CHECK (total > 0 AND correct >= 0 AND correct <= total
           AND mistakes >= 0 AND duration_sec >= 0 AND stars BETWEEN 0 AND 3);

-- Access goes through the backend service role only (migration 0028 policy).
ALTER TABLE public.school_activity_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS school_activity_results_participant_idx
  ON public.school_activity_results (participant_id);
