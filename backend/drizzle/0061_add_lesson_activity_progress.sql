ALTER TABLE lesson_run_devices ADD COLUMN assignment_version integer NOT NULL DEFAULT 0 CHECK (assignment_version >= 0);
--> statement-breakpoint
CREATE TABLE lesson_activity_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES lesson_run_dispatches(id) ON DELETE CASCADE,
  lesson_run_student_id uuid NOT NULL REFERENCES lesson_run_students(id) ON DELETE CASCADE,
  lesson_run_device_id uuid NOT NULL REFERENCES lesson_run_devices(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  progress jsonb NOT NULL CHECK (jsonb_typeof(progress) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_activity_progress_student_dispatch_uq UNIQUE (dispatch_id, lesson_run_student_id)
);
--> statement-breakpoint
ALTER TABLE lesson_activity_progress ENABLE ROW LEVEL SECURITY;
