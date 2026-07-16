-- Migration 0037: draft/review/publish workflow and immutable history for lessons.
-- The published snapshot remains the child-facing source while an admin edits
-- a newer draft in the same logical lesson row.

ALTER TABLE public.micro_lessons
  ADD COLUMN IF NOT EXISTS edit_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS published_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS published_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.micro_lessons DROP CONSTRAINT IF EXISTS micro_lessons_status_check;
ALTER TABLE public.micro_lessons ADD CONSTRAINT micro_lessons_status_check
  CHECK (status IN ('draft', 'review', 'published', 'archived'));
ALTER TABLE public.micro_lessons DROP CONSTRAINT IF EXISTS micro_lessons_edit_version_check;
ALTER TABLE public.micro_lessons ADD CONSTRAINT micro_lessons_edit_version_check
  CHECK (edit_version >= 1);
ALTER TABLE public.micro_lessons DROP CONSTRAINT IF EXISTS micro_lessons_published_version_check;
ALTER TABLE public.micro_lessons ADD CONSTRAINT micro_lessons_published_version_check
  CHECK (published_version IS NULL OR published_version >= 1);

UPDATE public.micro_lessons
SET
  published_version = version,
  published_snapshot = jsonb_build_object(
    'id', id,
    'version', version,
    'title', title,
    'cards', cards,
    'videoUrl', video_url,
    'checkQuestions', check_questions
  ),
  published_at = COALESCE(published_at, updated_at, created_at, now())
WHERE status = 'published' AND published_version IS NULL;

CREATE TABLE IF NOT EXISTS public.micro_lesson_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id text NOT NULL REFERENCES public.micro_lessons(id) ON DELETE CASCADE,
  edit_version integer NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT micro_lesson_revisions_edit_version_check CHECK (edit_version >= 1),
  CONSTRAINT micro_lesson_revisions_action_check
    CHECK (action IN ('create', 'update', 'status', 'restore', 'backfill')),
  CONSTRAINT micro_lesson_revisions_lesson_edit_version_uq UNIQUE (lesson_id, edit_version)
);

INSERT INTO public.micro_lesson_revisions
  (lesson_id, edit_version, action, snapshot, changed_by, created_at)
SELECT id, edit_version, 'backfill', to_jsonb(micro_lessons), updated_by,
  COALESCE(updated_at, created_at, now())
FROM public.micro_lessons
ON CONFLICT (lesson_id, edit_version) DO NOTHING;

CREATE INDEX IF NOT EXISTS micro_lesson_revisions_lesson_created_idx
  ON public.micro_lesson_revisions (lesson_id, created_at DESC);
ALTER TABLE public.micro_lesson_revisions ENABLE ROW LEVEL SECURITY;
