-- Migration 0050: Lesson Engine runs (docs/lesson-engine/README.md, stage F).
-- A run is one teacher conducting one published lesson with one class. It
-- freezes the published snapshot at creation, so later edits never touch a
-- run in progress or its history. Additive only (ADR-0008).

CREATE TABLE IF NOT EXISTS public.lesson_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.teacher_classes(id) ON DELETE RESTRICT,
  lesson_id text NOT NULL REFERENCES public.curriculum_lessons(id) ON DELETE RESTRICT,
  lesson_published_version integer NOT NULL,
  -- Full published definition, answer keys included: runs score against it.
  lesson_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'prepared',
  current_step_index integer NOT NULL DEFAULT 0,
  current_block_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  paused_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_runs_status_check
    CHECK (status IN ('prepared', 'active', 'paused', 'finished', 'cancelled')),
  CONSTRAINT lesson_runs_published_version_check CHECK (lesson_published_version >= 1),
  CONSTRAINT lesson_runs_step_check CHECK (current_step_index >= 0),
  CONSTRAINT lesson_runs_started_check CHECK (status IN ('prepared', 'cancelled') OR started_at IS NOT NULL),
  CONSTRAINT lesson_runs_paused_check CHECK (status <> 'paused' OR paused_at IS NOT NULL),
  CONSTRAINT lesson_runs_finished_check CHECK (status <> 'finished' OR finished_at IS NOT NULL),
  CONSTRAINT lesson_runs_cancelled_check CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);

-- One open run per class: a second "start lesson" must resume, not fork.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_runs_one_open_per_class_uq
  ON public.lesson_runs (class_id) WHERE status IN ('prepared', 'active', 'paused');
CREATE INDEX IF NOT EXISTS lesson_runs_teacher_created_idx
  ON public.lesson_runs (teacher_id, created_at DESC);

ALTER TABLE public.lesson_runs ENABLE ROW LEVEL SECURITY;

-- Identity and snapshot never change; finished and cancelled runs are frozen.
CREATE OR REPLACE FUNCTION public.lesson_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lesson runs are never deleted';
  END IF;
  IF OLD.status IN ('finished', 'cancelled') THEN
    RAISE EXCEPTION 'lesson run % is % and immutable', OLD.id, OLD.status;
  END IF;
  IF NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
     OR NEW.class_id IS DISTINCT FROM OLD.class_id
     OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
     OR NEW.lesson_published_version IS DISTINCT FROM OLD.lesson_published_version
     OR NEW.lesson_snapshot IS DISTINCT FROM OLD.lesson_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'lesson run % identity and snapshot are immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_runs_guard ON public.lesson_runs;
CREATE TRIGGER lesson_runs_guard
  BEFORE UPDATE OR DELETE ON public.lesson_runs
  FOR EACH ROW EXECUTE FUNCTION public.lesson_runs_guard();

-- Roster snapshot at run creation. class_student_id is the persistent student
-- identity (no student accounts). SET NULL: a teacher deleting a student
-- anonymises that student's run rows instead of being blocked by history.
CREATE TABLE IF NOT EXISTS public.lesson_run_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_run_id uuid NOT NULL REFERENCES public.lesson_runs(id) ON DELETE RESTRICT,
  class_student_id uuid REFERENCES public.class_students(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'expected',
  joined_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_run_students_status_check CHECK (status IN ('expected', 'joined', 'absent')),
  CONSTRAINT lesson_run_students_run_student_uq UNIQUE (lesson_run_id, class_student_id)
);

ALTER TABLE public.lesson_run_students ENABLE ROW LEVEL SECURITY;

-- Lifecycle events for audit and reports — not a UI telemetry stream.
CREATE TABLE IF NOT EXISTS public.lesson_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_run_id uuid NOT NULL REFERENCES public.lesson_runs(id) ON DELETE RESTRICT,
  type text NOT NULL,
  block_id text,
  actor_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_run_events_type_check CHECK (type IN (
    'run_created', 'run_started', 'block_opened', 'activity_dispatched',
    'run_paused', 'run_resumed', 'run_finished', 'run_cancelled'
  )),
  CONSTRAINT lesson_run_events_actor_check CHECK (actor_type IN ('teacher', 'system'))
);

CREATE INDEX IF NOT EXISTS lesson_run_events_run_created_idx
  ON public.lesson_run_events (lesson_run_id, created_at);

ALTER TABLE public.lesson_run_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.lesson_run_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'lesson_run_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS lesson_run_events_append_only ON public.lesson_run_events;
CREATE TRIGGER lesson_run_events_append_only
  BEFORE UPDATE OR DELETE ON public.lesson_run_events
  FOR EACH ROW EXECUTE FUNCTION public.lesson_run_events_append_only();
