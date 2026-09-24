-- Migration 0054: classroom control (docs/lesson-engine, stage I).
-- A teacher assigns lab computers (ids reported by a classroom control
-- provider, e.g. "PC-01") to roster students once per class. Opening a lesson
-- on those computers creates pre-mapped run devices with single-use launch
-- tokens, so children join without typing a code. The provider only ever
-- sees computer ids and URLs — never names, scores or evidence.

CREATE TABLE IF NOT EXISTS public.device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.teacher_classes(id) ON DELETE CASCADE,
  remote_device_id text NOT NULL,
  class_student_id uuid NOT NULL REFERENCES public.class_students(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_assignments_remote_id_check CHECK (remote_device_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  CONSTRAINT device_assignments_class_device_uq UNIQUE (class_id, remote_device_id),
  CONSTRAINT device_assignments_class_student_uq UNIQUE (class_id, class_student_id)
);

ALTER TABLE public.device_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lesson_run_devices
  ADD COLUMN IF NOT EXISTS remote_device_id text,
  -- sha256 of the single-use launch token; the token itself is never stored.
  ADD COLUMN IF NOT EXISTS launch_token_hash text,
  ADD COLUMN IF NOT EXISTS launch_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS launched_at timestamptz;

ALTER TABLE public.lesson_run_devices DROP CONSTRAINT IF EXISTS lesson_run_devices_launch_check;
ALTER TABLE public.lesson_run_devices ADD CONSTRAINT lesson_run_devices_launch_check CHECK (
  (launch_token_hash IS NULL AND launch_expires_at IS NULL)
  OR (launch_token_hash ~ '^[0-9a-f]{64}$' AND launch_expires_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS lesson_run_devices_launch_token_uq
  ON public.lesson_run_devices (launch_token_hash) WHERE launch_token_hash IS NOT NULL;

ALTER TABLE public.lesson_run_events DROP CONSTRAINT IF EXISTS lesson_run_events_type_check;
ALTER TABLE public.lesson_run_events ADD CONSTRAINT lesson_run_events_type_check CHECK (type IN (
  'run_created', 'run_started', 'block_opened', 'activity_dispatched', 'activity_closed',
  'run_paused', 'run_resumed', 'run_finished', 'run_cancelled',
  'join_opened', 'join_closed', 'device_joined', 'device_mapped', 'device_unmapped', 'device_revoked',
  'devices_launched', 'device_launched'
));
