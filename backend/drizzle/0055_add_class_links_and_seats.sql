-- Migration 0055: class link and remembered seats (docs/lesson-engine).
-- A class link is one stable address per class that joins whatever lesson the
-- class has open (saved once, e.g. as a Classroom Remote quick link). Its key
-- is an HMAC over (class id, link_version) computed by the backend: no secret
-- is stored, and bumping link_version revokes every copy of the old link.
-- A seat is a random secret a lab browser keeps in localStorage; only its
-- sha256 is stored, together with the roster student last seen there, so the
-- next lesson maps that device automatically.

CREATE TABLE IF NOT EXISTS public.lesson_class_links (
  class_id uuid PRIMARY KEY REFERENCES public.teacher_classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  link_version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_class_links_version_check CHECK (link_version >= 1)
);

ALTER TABLE public.lesson_class_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lesson_class_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.teacher_classes(id) ON DELETE CASCADE,
  seat_hash text NOT NULL,
  class_student_id uuid NOT NULL REFERENCES public.class_students(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_class_seats_hash_check CHECK (seat_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT lesson_class_seats_class_seat_uq UNIQUE (class_id, seat_hash),
  CONSTRAINT lesson_class_seats_class_student_uq UNIQUE (class_id, class_student_id)
);

ALTER TABLE public.lesson_class_seats ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lesson_run_devices ADD COLUMN IF NOT EXISTS seat_hash text;
ALTER TABLE public.lesson_run_devices DROP CONSTRAINT IF EXISTS lesson_run_devices_seat_hash_check;
ALTER TABLE public.lesson_run_devices ADD CONSTRAINT lesson_run_devices_seat_hash_check
  CHECK (seat_hash IS NULL OR seat_hash ~ '^[0-9a-f]{64}$');
