-- Migration 0051: web join for Lesson Engine runs (docs/lesson-engine, stage G1).
-- A student opens the join page, types the run's 6-digit code and gets an
-- anonymous device with a pairing number. The teacher maps that number to a
-- roster student. Nothing about the child is sent to or stored for the
-- device until the teacher maps it. Additive only (ADR-0008).

ALTER TABLE public.lesson_runs
  ADD COLUMN IF NOT EXISTS join_code text,
  ADD COLUMN IF NOT EXISTS join_code_expires_at timestamptz;

ALTER TABLE public.lesson_runs DROP CONSTRAINT IF EXISTS lesson_runs_join_code_check;
ALTER TABLE public.lesson_runs ADD CONSTRAINT lesson_runs_join_code_check
  CHECK (
    (join_code IS NULL AND join_code_expires_at IS NULL)
    OR (join_code ~ '^[0-9]{6}$' AND join_code_expires_at IS NOT NULL)
  );
-- A closed run never keeps a join code.
ALTER TABLE public.lesson_runs DROP CONSTRAINT IF EXISTS lesson_runs_join_code_open_check;
ALTER TABLE public.lesson_runs ADD CONSTRAINT lesson_runs_join_code_open_check
  CHECK (join_code IS NULL OR status IN ('prepared', 'active', 'paused'));

CREATE UNIQUE INDEX IF NOT EXISTS lesson_runs_join_code_uq
  ON public.lesson_runs (join_code) WHERE join_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lesson_run_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_run_id uuid NOT NULL REFERENCES public.lesson_runs(id) ON DELETE RESTRICT,
  -- Shown big on the child's screen so the teacher can say who is who.
  pairing_number integer NOT NULL,
  lesson_run_student_id uuid REFERENCES public.lesson_run_students(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT lesson_run_devices_pairing_check CHECK (pairing_number BETWEEN 1 AND 999),
  CONSTRAINT lesson_run_devices_run_pairing_uq UNIQUE (lesson_run_id, pairing_number),
  CONSTRAINT lesson_run_devices_revoked_unmapped_check
    CHECK (revoked_at IS NULL OR lesson_run_student_id IS NULL)
);

-- One live device per student in a run.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_run_devices_one_per_student_uq
  ON public.lesson_run_devices (lesson_run_student_id)
  WHERE lesson_run_student_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS lesson_run_devices_run_idx
  ON public.lesson_run_devices (lesson_run_id, pairing_number);

ALTER TABLE public.lesson_run_devices ENABLE ROW LEVEL SECURITY;

-- Devices are revoked, never deleted: attempts will reference them.
CREATE OR REPLACE FUNCTION public.lesson_run_devices_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'lesson run devices are revoked, never deleted';
END;
$$;

DROP TRIGGER IF EXISTS lesson_run_devices_no_delete ON public.lesson_run_devices;
CREATE TRIGGER lesson_run_devices_no_delete
  BEFORE DELETE ON public.lesson_run_devices
  FOR EACH ROW EXECUTE FUNCTION public.lesson_run_devices_no_delete();

-- Join and mapping become part of the run's audit trail.
ALTER TABLE public.lesson_run_events DROP CONSTRAINT IF EXISTS lesson_run_events_type_check;
ALTER TABLE public.lesson_run_events ADD CONSTRAINT lesson_run_events_type_check CHECK (type IN (
  'run_created', 'run_started', 'block_opened', 'activity_dispatched',
  'run_paused', 'run_resumed', 'run_finished', 'run_cancelled',
  'join_opened', 'join_closed', 'device_joined', 'device_mapped', 'device_unmapped', 'device_revoked'
));
ALTER TABLE public.lesson_run_events DROP CONSTRAINT IF EXISTS lesson_run_events_actor_check;
ALTER TABLE public.lesson_run_events ADD CONSTRAINT lesson_run_events_actor_check
  CHECK (actor_type IN ('teacher', 'system', 'device'));
